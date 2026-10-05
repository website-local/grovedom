#include "internal.h"
#include "selectors.h"
#include <lexbor/html/tag.h>
#include <lexbor/html/tree_res.h>

typedef lxb_css_selector_t selector;
typedef lxb_css_selector_list_t selector_list;
typedef lxb_dom_node_t node;

/* Tag and attribute IDs share Lexbor's pointer-sized identifier representation. */
struct gd_selector_guard { selector *atom; lxb_tag_id_t tag; int possible; };
static lxb_status_t found(node *, lxb_css_selector_specificity_t, void *);

static selector *guard_atom(selector_list *list) {
    selector *best = NULL, *attribute = NULL;
    for (selector *s = list->last; s; s = s->prev) {
        if (s->type == LXB_CSS_SELECTOR_TYPE_ID) return s;
        if (s->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE && !s->ns.length) attribute = s;
        if (s->type == LXB_CSS_SELECTOR_TYPE_CLASS) best = s;
        else if (!best && s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT) best = s;
        if (s->combinator != LXB_CSS_SELECTOR_COMBINATOR_CLOSE) break;
    }
    return best ? best : attribute;
}

gd_selector_guard *gd_selector_guard_create(gd_document *doc, selector_list *list) {
    size_t count = 0;
    for (selector_list *group = list; group; group = group->next) {
        selector *candidate = guard_atom(group);
        if (!candidate || (candidate->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE && !doc->templates)) return NULL;
        count++;
    }
    if (doc->selector_flags || (!doc->templates && count < 8 && !(count == 1 && list->first == list->last))) return NULL;
    if (count > SIZE_MAX / sizeof(gd_selector_guard) - 1) {
        gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector guard capacity exceeded"); return NULL;
    }
    gd_selector_guard *guards = lexbor_mraw_alloc(doc->css->memory->mraw, (count + 1) * sizeof(*guards));
    if (!guards) { gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector guard allocation failed"); return NULL; }
    size_t i = 0;
    for (selector_list *group = list; group; group = group->next) guards[i++] = (gd_selector_guard) { guard_atom(group), 0, 1 };
    guards[i] = (gd_selector_guard) {0};
    return guards;
}

/* A 256-byte Bloom filter rejects only definitely absent class/ID values.
 * It belongs to the document text arena and is built lazily for whole-document
 * compound/list queries on template documents. Scoped/detached queries bypass
 * it. Insertions and class/ID writes invalidate it; removed nodes may safely
 * leave extra bits. No node index or allocation inside the scan is needed. */
static uint32_t summary_hash(const lxb_char_t *data, size_t length, unsigned kind) {
    uint32_t hash = 2166136261u ^ kind;
    for (size_t i = 0; i < length; i++) hash = (hash ^ data[i]) * 16777619u;
    return hash;
}
static void summary_add(gd_document *doc, const lxb_char_t *data, size_t length, unsigned kind) {
    uint32_t hash = summary_hash(data, length, kind), a = hash & 2047, b = (hash >> 11) & 2047;
    doc->selector_summary[a >> 5] |= 1u << (a & 31);
    doc->selector_summary[b >> 5] |= 1u << (b & 31);
}
static int summary_build(gd_document *doc) {
    if (!doc->selector_summary) doc->selector_summary = lexbor_mraw_alloc(doc->html->dom_document.text, 256);
    if (!doc->selector_summary) return gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector summary allocation failed");
    memset(doc->selector_summary, 0, 256);
    node *root = &doc->html->dom_document.node, *n = root;
    for (;;) {
        if (n->type == LXB_DOM_NODE_TYPE_ELEMENT) {
            lxb_dom_element_t *element = lxb_dom_interface_element(n);
            lxb_dom_attr_t *attr = element->attr_id;
            if (attr && attr->value && attr->value->length) summary_add(doc, attr->value->data, attr->value->length, LXB_CSS_SELECTOR_TYPE_ID);
            attr = element->attr_class;
            if (attr && attr->value && attr->value->length) {
                const lxb_char_t *p = attr->value->data, *end = p + attr->value->length;
                while (p < end) {
                    while (p < end && lexbor_utils_whitespace(*p, ==, ||)) p++;
                    const lxb_char_t *start = p;
                    while (p < end && !lexbor_utils_whitespace(*p, ==, ||)) p++;
                    if (p != start) summary_add(doc, start, p - start, LXB_CSS_SELECTOR_TYPE_CLASS);
                }
            }
        }
        if (n->first_child) { n = n->first_child; continue; }
        while (n != root && !n->next) n = n->parent;
        if (n == root) break;
        n = n->next;
    }
    doc->selector_summary_valid = 1;
    return 1;
}
static int summary_branch(gd_document *doc, selector_list *list) {
    for (selector *s = list->first; s; s = s->next) {
        if (s->type != LXB_CSS_SELECTOR_TYPE_ID && s->type != LXB_CSS_SELECTOR_TYPE_CLASS) continue;
        /* Pure tag/attribute lists have no use for a class/ID summary. */
        if (!doc->selector_summary_valid && !summary_build(doc)) return 0;
        uint32_t hash = summary_hash(s->name.data, s->name.length, s->type), a = hash & 2047, b = (hash >> 11) & 2047;
        if (!(doc->selector_summary[a >> 5] & (1u << (a & 31))) || !(doc->selector_summary[b >> 5] & (1u << (b & 31)))) return 0;
    }
    return 1;
}
int gd_selector_guard_prepare(gd_document *doc, int document_scope) {
    int possible = doc->selector_guard == NULL;
    gd_selector_guard *first = doc->selector_guard;
    int filter = document_scope && doc->templates && !doc->xml && first &&
        (first[1].atom || first->atom->list->first != first->atom->list->last);
    for (gd_selector_guard *g = doc->selector_guard; g && g->atom; g++) {
        g->possible = !filter || summary_branch(doc, g->atom->list);
        if (!g->possible) { if (doc->error_code) return 0; continue; }
        // An unknown name can become known after insertion or renaming. Resolve
        // missing IDs on each query, never on each element and never cache a miss.
        if (!g->tag && g->atom->type == LXB_CSS_SELECTOR_TYPE_ELEMENT)
            g->tag = lxb_tag_id_by_name(doc->html->dom_document.tags, g->atom->name.data, g->atom->name.length);
        if (!g->tag && g->atom->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE) {
            const lxb_dom_attr_data_t *data = lxb_dom_attr_data_by_local_name(doc->html->dom_document.attrs, g->atom->name.data, g->atom->name.length);
            if (data) g->tag = data->attr_id;
        }
        if (g->tag || (g->atom->type != LXB_CSS_SELECTOR_TYPE_ELEMENT && g->atom->type != LXB_CSS_SELECTOR_TYPE_ATTRIBUTE)) possible = 1;
        else g->possible = 0;
    }
    /* Partition guard records, not the CSS AST. OR-branch order does not affect
     * boolean membership; results still follow DOM preorder. Prepare all records
     * again for every query so mutations and scope changes can reactivate them. */
    doc->selector_guard_active = 0;
    for (gd_selector_guard *g = doc->selector_guard; g && g->atom; g++) {
        if (!g->possible) continue;
        gd_selector_guard *next = doc->selector_guard + doc->selector_guard_active++;
        if (next != g) { gd_selector_guard saved = *next; *next = *g; *g = saved; }
    }
    return possible;
}

int gd_selector_plain_tag(const lxb_char_t *name, size_t length) {
    /* A conservative CSS identifier subset. Escapes, namespaces, non-ASCII
     * names and every compound/list selector keep the ordinary parser. */
    if (!length || (name[0] | 32) < 'a' || (name[0] | 32) > 'z') return 0;
    for (size_t i = 1; i < length; i++) {
        unsigned c = name[i], lower = c | 32;
        if (!((lower >= 'a' && lower <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_')) return 0;
    }
    return 1;
}

lxb_tag_id_t gd_selector_simple_tag(gd_document *doc) {
    gd_selector_guard *g = doc->selector_guard;
    if (!g || g[1].atom || g->atom->type != LXB_CSS_SELECTOR_TYPE_ELEMENT ||
        g->atom->list->first != g->atom->list->last) return 0;
    return g->tag;
}

static int guard_candidate(gd_document *doc, gd_selector_guard *g, node *n, lxb_dom_element_t *element) {
    selector *s = g->atom;
    if (s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT) {
        return g->tag && n->local_name == g->tag && gd_selector_tag_case(doc, n);
    }
    if (s->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE) return g->tag && lxb_dom_element_attr_by_id(element, g->tag) != NULL;
    lxb_dom_attr_t *attr = s->type == LXB_CSS_SELECTOR_TYPE_ID ? element->attr_id : element->attr_class;
    if (!attr || !attr->value || attr->value->length < s->name.length) return 0;
    lexbor_str_t *value = attr->value;
    if (s->type == LXB_CSS_SELECTOR_TYPE_ID) {
        if (value->length == s->name.length && memcmp(value->data, s->name.data, s->name.length) == 0) return 1;
    } else {
        const lxb_char_t *p = value->data, *end = p + value->length;
        while (p < end) {
            while (p < end && lexbor_utils_whitespace(*p, ==, ||)) p++;
            const lxb_char_t *start = p;
            while (p < end && !lexbor_utils_whitespace(*p, ==, ||)) p++;
            if ((size_t) (p - start) == s->name.length && memcmp(start, s->name.data, s->name.length) == 0) return 1;
        }
    }
    return 0;
}

int gd_selector_guard_match(gd_document *doc, node *n) {
    GD_PROFILE_ADD(GP_GUARD_NODES, 1);
    lxb_dom_element_t *element = lxb_dom_interface_element(n);
    for (size_t i = 0; i < doc->selector_guard_active; i++) {
        gd_selector_guard *g = doc->selector_guard + i;
        if (!guard_candidate(doc, g, n, element)) continue;
        GD_PROFILE_ADD(GP_GUARD_CANDIDATES, 1);
        if (g->atom->list->first == g->atom->list->last &&
            (g->atom->type != LXB_CSS_SELECTOR_TYPE_ATTRIBUTE || !g->atom->u.attribute.value.data)) return 1;
        // Only validate branches whose necessary atom passed. The cached AST
        // never escapes this synchronous call; restore its link on every path.
        selector_list *list = g->atom->list, *next = list->next;
        list->next = NULL;
        int matched = 0;
        GD_PROFILE_ADD(GP_GUARD_VALIDATIONS, 1);
        lxb_status_t status = lxb_selectors_match_node(doc->selectors, n, list, found, &matched);
        list->next = next;
        if (status != LXB_STATUS_OK) return gd_set_error(doc, "ERR_GROVEDOM_SELECTOR", "Selector execution failed");
        if (matched) return 1;
    }
    return 0;
}

static selector_list *nested_plan(selector *s) {
    if (s->type != LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS_FUNCTION) return NULL;
    switch (s->u.pseudo.type) {
        case LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_HAS:
        case LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_IS:
        case LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NOT:
        case LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_WHERE: return s->u.pseudo.data;
        case LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_CHILD:
        case LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_LAST_CHILD:
            return ((lxb_css_selector_anb_of_t *) s->u.pseudo.data)->of;
        default: return NULL;
    }
}

int gd_selector_tag_case(gd_document *doc, node *n) {
    if (doc->xml || n->ns == LXB_NS_HTML) return 1;
    size_t length;
    const lxb_char_t *name = lxb_dom_element_qualified_name(lxb_dom_interface_element(n), &length);
    for (size_t i = 0; i < length; i++) if (name[i] >= 'A' && name[i] <= 'Z') return 0;
    return 1;
}

static int html_adjusted_name(gd_document *doc, selector *s) {
    if (s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT) {
        lxb_tag_id_t id = lxb_tag_id_by_name(doc->html->dom_document.tags, s->name.data, s->name.length);
        const lxb_html_tag_fixname_t *name = lxb_html_tag_fixname_svg(id);
        return name && name->name;
    }
    if (s->name.length == 13 && memcmp(s->name.data, "definitionurl", 13) == 0) return 1;
    for (size_t i = 0; i < sizeof(lxb_html_tree_res_attr_adjust_svg_map) / sizeof(*lxb_html_tree_res_attr_adjust_svg_map); i++) {
        const lxb_html_tree_res_attr_adjust_t *name = &lxb_html_tree_res_attr_adjust_svg_map[i];
        if (s->name.length == name->len && memcmp(s->name.data, name->from, name->len) == 0) return 1;
    }
    return 0;
}

unsigned gd_selector_flags(gd_document *doc, selector_list *list) {
    unsigned flags = 0;
    selector *s = list->first;
    while (s) {
        if (!doc->xml && (s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT || s->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE)) {
            for (size_t i = 0; i < s->name.length; i++) if (s->name.data[i] >= 'A' && s->name.data[i] <= 'Z') s->name.data[i] += 'a' - 'A';
            if (html_adjusted_name(doc, s)) flags |= GD_SELECTOR_CUSTOM;
        }
        if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS && s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_EMPTY) flags |= GD_SELECTOR_CUSTOM;
        if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS_FUNCTION) {
            /* Lexbor's list pseudo-classes on the left of a combinator stop
             * after a failed nearest ancestor. Our chain matcher retries the
             * remaining ancestors, as Cheerio and CSS require. */
            if (s->next && (s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_IS ||
                s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_WHERE ||
                s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NOT ||
                s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_HAS)) flags |= GD_SELECTOR_CUSTOM;
            if (s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_HAS) flags |= GD_SELECTOR_TEMPLATE;
            if (s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_LEXBOR_CONTAINS) flags |= GD_SELECTOR_CUSTOM;
        }
        selector_list *nested = nested_plan(s);
        if (nested && nested->first) { s = nested->first; continue; }
        for (;;) {
            if (s->next) { s = s->next; break; }
            if (s->list->next) { s = s->list->next->first; break; }
            s = s->list->parent;
            if (!s) return flags;
        }
    }
    return flags;
}

static node *previous_element(node *n) {
    do { n = n->prev; } while (n && n->type != LXB_DOM_NODE_TYPE_ELEMENT);
    return n;
}
static int match_list(gd_document *, node *, selector_list *, unsigned);
static int match_chain(gd_document *, node *, selector *, node *, unsigned);

static int anchored(node *n, node *scope, unsigned relation) {
    if (!scope) return 1;
    if (relation == LXB_CSS_SELECTOR_COMBINATOR_CHILD) return n->parent == scope;
    if (relation == LXB_CSS_SELECTOR_COMBINATOR_SIBLING) return previous_element(n) == scope;
    if (relation == LXB_CSS_SELECTOR_COMBINATOR_FOLLOWING) {
        while ((n = previous_element(n))) if (n == scope) return 1;
    } else {
        // :has searches through fragments, but CSS ancestry between selector
        // components stops at the fragment (handled in match_chain).
        while ((n = n->parent)) if (n == scope) return 1;
    }
    return 0;
}

static int has(gd_document *doc, node *scope, selector_list *list, unsigned depth) {
    for (; list; list = list->next) {
        unsigned relation = list->first->combinator;
        node *start = relation == LXB_CSS_SELECTOR_COMBINATOR_SIBLING || relation == LXB_CSS_SELECTOR_COMBINATOR_FOLLOWING ? scope->next : scope->first_child;
        for (; start; start = start->next) {
            node *n = start;
            for (;;) {
                if (n->type == LXB_DOM_NODE_TYPE_ELEMENT && match_chain(doc, n, list->last, scope, depth + 1)) return 1;
                if (doc->error_code) return 0;
                if (n->first_child) { n = n->first_child; continue; }
                while (n != start && !n->next) n = n->parent;
                if (n == start) break;
                n = n->next;
            }
        }
    }
    return 0;
}

static int contains(gd_document *doc, node *root, const lxb_css_selector_contains_t *text) {
    if (!text->str.length) return 1;
    // domutils getText, used by Cheerio selectors, treats br as a newline and
    // skips template fragment roots. Reuse one document buffer across matches.
    doc->output.length = 0;
    node *n = root;
    for (;;) {
        lxb_status_t status = LXB_STATUS_OK;
        if (n->type == LXB_DOM_NODE_TYPE_TEXT) {
            lexbor_str_t *str = &lxb_dom_interface_character_data(n)->data;
            status = gd_write(str->data, str->length, &doc->output);
        } else if (n->type == LXB_DOM_NODE_TYPE_ELEMENT && n->local_name == LXB_TAG_BR) status = gd_write((const lxb_char_t *) "\n", 1, &doc->output);
        if (status != LXB_STATUS_OK) return gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector text allocation failed");
        if (n->first_child && (n->type == LXB_DOM_NODE_TYPE_ELEMENT || n->type == LXB_DOM_NODE_TYPE_CDATA_SECTION)) { n = n->first_child; continue; }
        while (n != root && !n->next) n = n->parent;
        if (n == root) break;
        n = n->next;
    }
    return doc->output.length >= text->str.length && lexbor_str_data_ncmp_contain(doc->output.data, doc->output.length, text->str.data, text->str.length);
}

static lxb_status_t found(node *n, lxb_css_selector_specificity_t specificity, void *context) {
    (void) n; (void) specificity; *(int *) context = 1; return LXB_STATUS_OK;
}
static int atom(gd_document *doc, node *n, selector *s, unsigned depth) {
    if (!doc->xml && !s->ns.length && s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT) {
        size_t length;
        const lxb_char_t *name = n->ns == LXB_NS_HTML ? lxb_dom_element_local_name(lxb_dom_interface_element(n), &length) : lxb_dom_element_qualified_name(lxb_dom_interface_element(n), &length);
        return length == s->name.length && memcmp(name, s->name.data, length) == 0;
    }
    if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS && s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_EMPTY) {
        for (node *child = n->first_child; child; child = child->next) {
            if (child->type == LXB_DOM_NODE_TYPE_ELEMENT || (child->type == LXB_DOM_NODE_TYPE_TEXT && lxb_dom_interface_character_data(child)->data.length)) return 0;
            if (child->type == LXB_DOM_NODE_TYPE_CDATA_SECTION && child->first_child &&
                lxb_dom_interface_character_data(child->first_child)->data.length) return 0;
        }
        return 1;
    }
    if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS_FUNCTION) {
        unsigned type = s->u.pseudo.type;
        if (type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_LEXBOR_CONTAINS) return contains(doc, n, s->u.pseudo.data);
        if (type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_HAS) return has(doc, n, s->u.pseudo.data, depth);
        if (type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_IS || type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_WHERE) return match_list(doc, n, s->u.pseudo.data, depth + 1);
        if (type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NOT) return !match_list(doc, n, s->u.pseudo.data, depth + 1);
        if ((type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_CHILD || type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_LAST_CHILD) && nested_plan(s)) {
            lxb_css_selector_anb_of_t *anb = s->u.pseudo.data;
            if (!match_list(doc, n, anb->of, depth + 1)) return 0;
            long index = 1;
            for (node *p = type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_CHILD ? n->prev : n->next; p; p = type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_CHILD ? p->prev : p->next) {
                if (p->type == LXB_DOM_NODE_TYPE_ELEMENT && match_list(doc, p, anb->of, depth + 1)) index++;
                if (doc->error_code) return 0;
            }
            long delta = index - anb->anb.b;
            return anb->anb.a ? delta % anb->anb.a == 0 && delta / anb->anb.a >= 0 : delta == 0;
        }
    }
    // Reuse Lexbor's ordinary atom semantics and pooled evaluator. Stack copies
    // isolate the atom without modifying cached ASTs or the document tree.
    lxb_dom_element_t element;
    lxb_dom_attr_t attribute;
    if (!doc->xml && !s->ns.length && s->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE) {
        lxb_dom_attr_t *found_attr = gd_attribute(doc, n, s->name.data, s->name.length);
        if (!found_attr) return 0;
        // Let Lexbor compare values/operators against exactly the attribute
        // visible through Cheerio's case-sensitive property lookup. Stack copies
        // avoid changing links or letting a same-ID camel-case attribute win.
        element = *lxb_dom_interface_element(n); attribute = *found_attr;
        element.first_attr = element.last_attr = &attribute;
        attribute.prev = attribute.next = NULL; attribute.owner = &element;
        n = &element.node;
    }
    selector copy = *s;
    selector_list list = {0};
    list.first = list.last = &copy;
    copy.list = &list; copy.prev = copy.next = NULL;
    copy.combinator = LXB_CSS_SELECTOR_COMBINATOR_DESCENDANT;
    int result = 0;
    if (lxb_selectors_match_node(doc->selectors, n, &list, found, &result) != LXB_STATUS_OK) return gd_set_error(doc, "ERR_GROVEDOM_SELECTOR", "Selector execution failed");
    return result;
}

static int match_chain(gd_document *doc, node *n, selector *s, node *scope, unsigned depth) {
    // Bound selector recursion independently of DOM depth and the Wasm stack.
    // Ordinary Lexbor plans do not use this compatibility path.
    if (depth >= 64) return gd_set_error(doc, "ERR_GROVEDOM_UNSUPPORTED", "Compatibility selector nesting exceeds 64");
    for (;;) {
        if (!atom(doc, n, s, depth) || doc->error_code) return 0;
        if (!s->prev) return anchored(n, scope, s->combinator);
        unsigned relation = s->combinator;
        s = s->prev;
        if (relation == LXB_CSS_SELECTOR_COMBINATOR_CLOSE) continue;
        if (relation == LXB_CSS_SELECTOR_COMBINATOR_CHILD) return n->parent && n->parent->type == LXB_DOM_NODE_TYPE_ELEMENT && match_chain(doc, n->parent, s, scope, depth + 1);
        if (relation == LXB_CSS_SELECTOR_COMBINATOR_SIBLING) { n = previous_element(n); return n && match_chain(doc, n, s, scope, depth + 1); }
        if (relation == LXB_CSS_SELECTOR_COMBINATOR_DESCENDANT) {
            while ((n = n->parent) && n->type == LXB_DOM_NODE_TYPE_ELEMENT) {
                if (match_chain(doc, n, s, scope, depth + 1)) return 1;
                if (doc->error_code) return 0;
            }
        } else if (relation == LXB_CSS_SELECTOR_COMBINATOR_FOLLOWING) {
            while ((n = previous_element(n))) {
                if (match_chain(doc, n, s, scope, depth + 1)) return 1;
                if (doc->error_code) return 0;
            }
        }
        return 0;
    }
}
static int match_list(gd_document *doc, node *n, selector_list *list, unsigned depth) {
    for (; list; list = list->next) {
        if (match_chain(doc, n, list->last, NULL, depth)) return 1;
        if (doc->error_code) return 0;
    }
    return 0;
}
int gd_selector_match(gd_document *doc, node *n, selector_list *list) { return match_list(doc, n, list, 0); }
