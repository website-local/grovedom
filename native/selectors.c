#include "selectors.h"

typedef lxb_css_selector_t selector;
typedef lxb_css_selector_list_t selector_list;
typedef lxb_dom_node_t node;

struct gd_selector_guard { selector *atom; lxb_tag_id_t tag; };
static lxb_status_t found(node *, lxb_css_selector_specificity_t, void *);

static selector *guard_atom(selector_list *list) {
    selector *best = NULL;
    for (selector *s = list->last; s; s = s->prev) {
        if (s->type == LXB_CSS_SELECTOR_TYPE_ID) return s;
        if (s->type == LXB_CSS_SELECTOR_TYPE_CLASS) best = s;
        else if (!best && s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT) best = s;
        if (s->combinator != LXB_CSS_SELECTOR_COMBINATOR_CLOSE) break;
    }
    return best;
}

gd_selector_guard *gd_selector_guard_create(gd_document *doc, selector_list *list) {
    size_t count = 0;
    for (selector_list *group = list; group; group = group->next) {
        if (!guard_atom(group)) return NULL;
        count++;
    }
    if (doc->selector_flags || (count < 8 && !(count == 1 && list->first == list->last))) return NULL;
    if (count > SIZE_MAX / sizeof(gd_selector_guard) - 1) {
        gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector guard capacity exceeded"); return NULL;
    }
    gd_selector_guard *guards = lexbor_mraw_alloc(doc->css->memory->mraw, (count + 1) * sizeof(*guards));
    if (!guards) { gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector guard allocation failed"); return NULL; }
    size_t i = 0;
    for (selector_list *group = list; group; group = group->next) guards[i++] = (gd_selector_guard) { guard_atom(group), 0 };
    guards[i] = (gd_selector_guard) {0};
    return guards;
}

int gd_selector_guard_prepare(gd_document *doc) {
    int possible = doc->selector_guard == NULL;
    for (gd_selector_guard *g = doc->selector_guard; g && g->atom; g++) {
        // An unknown name can become known after insertion or renaming. Resolve
        // missing IDs on each query, never on each element and never cache a miss.
        if (!g->tag && g->atom->type == LXB_CSS_SELECTOR_TYPE_ELEMENT)
            g->tag = lxb_tag_id_by_name(doc->html->dom_document.tags, g->atom->name.data, g->atom->name.length);
        if (g->tag || g->atom->type != LXB_CSS_SELECTOR_TYPE_ELEMENT) possible = 1;
    }
    return possible;
}

lxb_tag_id_t gd_selector_simple_tag(gd_document *doc) {
    gd_selector_guard *g = doc->selector_guard;
    if (!g || g[1].atom || g->atom->type != LXB_CSS_SELECTOR_TYPE_ELEMENT ||
        g->atom->list->first != g->atom->list->last) return 0;
    return g->tag;
}

static int guard_equal(const lxb_char_t *value, const lexbor_str_t *name, int quirks) {
    return quirks ? lexbor_str_data_ncasecmp(value, name->data, name->length) : memcmp(value, name->data, name->length) == 0;
}

static int guard_candidate(gd_selector_guard *g, node *n, lxb_dom_element_t *element, int quirks) {
    selector *s = g->atom;
    if (s->type == LXB_CSS_SELECTOR_TYPE_ELEMENT) {
        return g->tag && n->local_name == g->tag;
    }
    lxb_dom_attr_t *attr = s->type == LXB_CSS_SELECTOR_TYPE_ID ? element->attr_id : element->attr_class;
    if (!attr || !attr->value || attr->value->length < s->name.length) return 0;
    lexbor_str_t *value = attr->value;
    if (s->type == LXB_CSS_SELECTOR_TYPE_ID) {
        if (value->length == s->name.length && guard_equal(value->data, &s->name, quirks)) return 1;
    } else {
        const lxb_char_t *p = value->data, *end = p + value->length;
        while (p < end) {
            while (p < end && lexbor_utils_whitespace(*p, ==, ||)) p++;
            const lxb_char_t *start = p;
            while (p < end && !lexbor_utils_whitespace(*p, ==, ||)) p++;
            if ((size_t) (p - start) == s->name.length && guard_equal(start, &s->name, quirks)) return 1;
        }
    }
    return 0;
}

int gd_selector_guard_match(gd_document *doc, node *n) {
    GD_PROFILE_ADD(GP_GUARD_NODES, 1);
    lxb_dom_element_t *element = lxb_dom_interface_element(n);
    int quirks = n->owner_document->compat_mode == LXB_DOM_DOCUMENT_CMODE_QUIRKS;
    for (gd_selector_guard *g = doc->selector_guard; g->atom; g++) {
        if (!guard_candidate(g, n, element, quirks)) continue;
        GD_PROFILE_ADD(GP_GUARD_CANDIDATES, 1);
        if (g->atom->list->first == g->atom->list->last) return 1;
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

unsigned gd_selector_flags(selector_list *list) {
    unsigned flags = 0;
    selector *s = list->first;
    while (s) {
        if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS && s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_EMPTY) flags |= GD_SELECTOR_TEMPLATE;
        if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS_FUNCTION) {
            if (s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_HAS) flags |= GD_SELECTOR_TEMPLATE;
            if (s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_LEXBOR_CONTAINS) flags |= GD_SELECTOR_TEXT;
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
    if (s->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS && s->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_EMPTY) {
        for (node *child = n->first_child; child; child = child->next) {
            if (child->type == LXB_DOM_NODE_TYPE_ELEMENT || (child->type == LXB_DOM_NODE_TYPE_TEXT && lxb_dom_interface_character_data(child)->data.length)) return 0;
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
