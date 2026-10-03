/* Iterative XML support using the kernel arenas and reusable buffers. */
#include "xml.h"
#include <string.h>
#include <lexbor/dom/interfaces/cdata_section.h>
#include <lexbor/dom/interfaces/processing_instruction.h>

/* Exported by the pinned Lexbor source, omitted from its public header. */
LXB_API lxb_status_t lxb_dom_element_qualified_name_set(lxb_dom_element_t *,
    const lxb_char_t *, size_t, const lxb_char_t *, size_t);


static int gd_xml_space(unsigned char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }
static int gd_xml_name_char(unsigned char c, int first) {
    return c >= 128 || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == ':' || (!first && (c == '-' || c == '.' || (c >= '0' && c <= '9')));
}

/* The cache borrows immutable names from the document's intern tables, never
 * input bytes or a node. Collisions replace entries; the two 32-slot halves
 * keep element and attribute IDs separate. Lowercasing options use the normal
 * path so cached keys always have the exact public spelling. */
struct gd_xml_name_entry {
    const lxb_char_t *name;
    size_t length;
    uintptr_t local, qualified;
};

static gd_xml_name_entry *gd_xml_name_slot(gd_document *doc,
    const lxb_char_t *name, size_t length, int attribute) {
    if (!length) return NULL;
    if (!doc->xml_names) {
        doc->xml_names = lexbor_mraw_calloc(doc->html->dom_document.mraw,
                                           64 * sizeof(gd_xml_name_entry));
        if (!doc->xml_names) return NULL;
    }
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < length; i++) hash = (hash ^ name[i]) * 16777619u;
    return doc->xml_names + (hash & 31) + (attribute ? 32 : 0);
}

/* Lexbor folds local-name lookups even in XML documents. Keep its static
 * lowercase IDs (notably id/class); map every other name to an impossible XML
 * name containing lowercase hex. Qualified names retain the public spelling.
 * Selectors receive the same mapping once in the bounded plan arena. */
static int gd_xml_names(gd_document *doc, const lxb_char_t *name, size_t length,
                        int attribute, int lower, const lxb_char_t **original,
                        const lxb_char_t **key, size_t *key_length) {
    if (!length || length > (SIZE_MAX - 3) / 3 ||
        !gd_reserve((void **) &doc->xml_name.data, &doc->xml_name.capacity, length * 3 + 3, 1)) return 0;
    lxb_char_t *raw = doc->xml_name.data;
    int uppercase = 0;
    for (size_t i = 0; i < length; i++) {
        unsigned char c = name[i];
        if (!gd_xml_name_char(c, i == 0)) return 0;
        if (c >= 'A' && c <= 'Z') { if (lower) c += 'a' - 'A'; else uppercase = 1; }
        raw[i] = c;
    }
    raw[length] = 0;
    *original = raw; *key = raw; *key_length = length;
    if (!uppercase) {
        if (attribute) {
            const lxb_dom_attr_data_t *data = lxb_dom_attr_data_by_local_name(doc->html->dom_document.attrs, raw, length);
            if (data && data->attr_id < LXB_DOM_ATTR__LAST_ENTRY) return 1;
        } else {
            lxb_tag_id_t id = lxb_tag_id_by_name(doc->html->dom_document.tags, raw, length);
            if (id && id < LXB_TAG__LAST_ENTRY) return 1;
        }
    }
    static const char hex[] = "0123456789abcdef";
    lxb_char_t *encoded = raw + length + 1;
    encoded[0] = 1;
    for (size_t i = 0; i < length; i++) { encoded[1 + 2*i] = hex[raw[i] >> 4]; encoded[2 + 2*i] = hex[raw[i] & 15]; }
    encoded[1 + length*2] = 0;
    *key = encoded; *key_length = 1 + length*2;
    return 1;
}

int gd_xml_tag_id(gd_document *doc, const lxb_char_t *name, size_t length, lxb_tag_id_t *tag) {
    const lxb_char_t *raw, *key; size_t key_length;
    if (!gd_xml_names(doc, name, length, 0, doc->xml_flags & XML_LOWER_TAGS, &raw, &key, &key_length))
        return gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "XML selector name allocation failed");
    *tag = lxb_tag_id_by_name(doc->html->dom_document.tags, key, key_length);
    return 1;
}

lxb_dom_element_t *gd_xml_element(gd_document *doc, const lxb_char_t *name, size_t length, int lower) {
    GD_PROFILE_SCOPE(GP_XML_NAME);
    gd_xml_name_entry *cached = lower ? NULL : gd_xml_name_slot(doc, name, length, 0);
    if (cached && cached->name && cached->length == length && memcmp(cached->name, name, length) == 0) {
        GD_PROFILE_ADD(GP_XML_NAME_HITS, 1);
        lxb_dom_element_t *element = lxb_dom_document_create_interface(&doc->html->dom_document, cached->local, LXB_NS__UNDEF);
        if (element) {
            element->qualified_name = cached->qualified;
            element->custom_state = LXB_DOM_ELEMENT_CUSTOM_STATE_UNCUSTOMIZED;
        }
        return element;
    }
    GD_PROFILE_ADD(GP_XML_NAME_MISSES, 1);
    const lxb_char_t *raw, *key; size_t key_length;
    if (!gd_xml_names(doc, name, length, 0, lower, &raw, &key, &key_length)) return NULL;
    lxb_dom_element_t *element = lxb_dom_document_create_element(&doc->html->dom_document, key, key_length, NULL);
    if (element && lxb_dom_element_qualified_name_set(element, NULL, 0, raw, length) != LXB_STATUS_OK) return lxb_dom_element_interface_destroy(element);
    if (element && cached) {
        cached->name = lxb_dom_element_qualified_name(element, &cached->length);
        cached->local = element->node.local_name; cached->qualified = element->qualified_name;
    }
    return element;
}

lxb_status_t gd_xml_attr_name(gd_document *doc, lxb_dom_attr_t *attr, const lxb_char_t *name, size_t length, int lower) {
    GD_PROFILE_SCOPE(GP_XML_NAME);
    gd_xml_name_entry *cached = lower ? NULL : gd_xml_name_slot(doc, name, length, 1);
    if (cached && cached->name && cached->length == length && memcmp(cached->name, name, length) == 0) {
        GD_PROFILE_ADD(GP_XML_NAME_HITS, 1);
        attr->node.local_name = cached->local; attr->qualified_name = cached->qualified;
        return LXB_STATUS_OK;
    }
    GD_PROFILE_ADD(GP_XML_NAME_MISSES, 1);
    const lxb_char_t *raw, *key; size_t key_length;
    if (!gd_xml_names(doc, name, length, 1, lower, &raw, &key, &key_length)) return LXB_STATUS_ERROR;
    lxb_status_t status = lxb_dom_attr_set_name(attr, raw, length, false);
    if (status == LXB_STATUS_OK) status = lxb_dom_attr_set_name(attr, key, key_length, true);
    if (status == LXB_STATUS_OK && cached) {
        cached->name = lxb_dom_attr_qualified_name(attr, &cached->length);
        cached->local = attr->node.local_name; cached->qualified = attr->qualified_name;
    }
    return status;
}

static lxb_status_t gd_xml_codepoint(gd_buffer *out, uint32_t c) {
    unsigned char bytes[4]; size_t n;
    if (!c || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) c = 0xfffd;
    if (c < 0x80) { bytes[0] = c; n = 1; }
    else if (c < 0x800) { bytes[0] = 0xc0 | (c >> 6); bytes[1] = 0x80 | (c & 63); n = 2; }
    else if (c < 0x10000) { bytes[0] = 0xe0 | (c >> 12); bytes[1] = 0x80 | ((c >> 6) & 63); bytes[2] = 0x80 | (c & 63); n = 3; }
    else { bytes[0] = 0xf0 | (c >> 18); bytes[1] = 0x80 | ((c >> 12) & 63); bytes[2] = 0x80 | ((c >> 6) & 63); bytes[3] = 0x80 | (c & 63); n = 4; }
    return gd_write(bytes, n, out);
}

static int gd_xml_decode(gd_document *doc, const lxb_char_t **data, size_t *length) {
    GD_PROFILE_SCOPE(GP_XML_DECODE);
    if (!(doc->xml_flags & XML_DECODE) || !memchr(*data, '&', *length)) return 1;
    const lxb_char_t *s = *data; size_t n = *length, run = 0;
    doc->output.length = 0;
    for (size_t i = 0; i < n; i++) {
        if (s[i] != '&') continue;
        size_t end = i + 1; uint32_t c = 0; int found = 0;
        if (end < n && s[end] == '#') {
            end++; unsigned base = 10;
            if (end < n && (s[end] == 'x' || s[end] == 'X')) { base = 16; end++; }
            size_t start = end;
            for (; end < n; end++) {
                unsigned d = s[end] >= '0' && s[end] <= '9' ? s[end] - '0' : s[end] >= 'a' && s[end] <= 'f' ? s[end] - 'a' + 10 : s[end] >= 'A' && s[end] <= 'F' ? s[end] - 'A' + 10 : 99;
                if (d >= base) break;
                c = c > 0x10ffff / base ? 0x110000 : c * base + d;
            }
            found = end > start && end < n && s[end] == ';';
        } else {
            static const struct { const char *name; unsigned length, value; } entities[] = {
                {"amp;",4,'&'}, {"lt;",3,'<'}, {"gt;",3,'>'}, {"quot;",5,'"'}, {"apos;",5,'\''}
            };
            for (unsigned j = 0; j < 5; j++) if (n - end >= entities[j].length && memcmp(s + end, entities[j].name, entities[j].length) == 0) {
                c = entities[j].value; end += entities[j].length - 1; found = 1; break;
            }
        }
        if (!found) continue;
        if (gd_write(s + run, i - run, &doc->output) != LXB_STATUS_OK || gd_xml_codepoint(&doc->output, c) != LXB_STATUS_OK) return 0;
        i = end; run = end + 1;
    }
    if (gd_write(s + run, n - run, &doc->output) != LXB_STATUS_OK) return 0;
    *data = doc->output.data; *length = doc->output.length;
    return 1;
}

lxb_dom_interface_t *gd_xml_clone_interface(lxb_dom_document_t *document, const lxb_dom_interface_t *source) {
    const lxb_dom_node_t *node = source;
    if (node->type == LXB_DOM_NODE_TYPE_CDATA_SECTION) {
        /* Only the child text holds data; the wrapper has no character data. */
        return lxb_dom_cdata_section_interface_create(document);
    }
    if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
        lxb_dom_element_t *copy = lxb_dom_element_interface_clone(document, source);
        if (copy) copy->qualified_name = ((const lxb_dom_element_t *) source)->qualified_name;
        return copy;
    }
    return lxb_dom_interface_clone(document, source);
}

/* Parent links are the parse stack. A fragment is destroyed on any failure;
 * completed trees keep the same document ownership as HTML nodes. */
lxb_dom_node_t *gd_xml_parse(gd_document *doc, const lxb_char_t *s, size_t n) {
    lxb_dom_document_t *dom = &doc->html->dom_document;
    lxb_dom_node_t *root = lxb_dom_interface_node(lxb_dom_document_create_document_fragment(dom));
    if (!root) return NULL;
    lxb_dom_node_t *parent = root;
    size_t i = 0;
    while (i < n) {
        if (s[i] != '<') {
            size_t start = i; while (i < n && s[i] != '<') i++;
            const lxb_char_t *data = s + start; size_t length = i - start;
            if (!gd_xml_decode(doc, &data, &length)) goto failed;
            lxb_dom_node_t *node = lxb_dom_interface_node(lxb_dom_document_create_text_node(dom, data, length));
            if (!node) goto failed;
            lxb_dom_node_insert_child(parent, node); continue;
        }
        if (n - i >= 4 && memcmp(s + i, "<!--", 4) == 0) {
            size_t start = i += 4;
            while (n - i >= 3 && memcmp(s + i, "-->", 3) != 0) i++;
            if (n - i < 3) goto malformed;
            lxb_dom_node_t *node = lxb_dom_interface_node(lxb_dom_document_create_comment(dom, s + start, i - start));
            if (!node) goto failed;
            lxb_dom_node_insert_child(parent, node); i += 3; continue;
        }
        if (n - i >= 9 && memcmp(s + i, "<![CDATA[", 9) == 0) {
            size_t start = i += 9;
            while (n - i >= 3 && memcmp(s + i, "]]>", 3) != 0) i++;
            if (n - i < 3) goto malformed;
            /* The pinned document helper rejects XML dtype; create the DOM
             * interface directly. Cheerio exposes its data as a text child. */
            lxb_dom_node_t *node = lxb_dom_interface_node(lxb_dom_cdata_section_interface_create(dom));
            if (!node) goto failed;
            lxb_dom_node_insert_child(parent, node);
            lxb_dom_node_t *text = lxb_dom_interface_node(lxb_dom_document_create_text_node(dom, s + start, i - start));
            if (!text) goto failed;
            lxb_dom_node_insert_child(node, text); i += 3; continue;
        }
        if (n - i >= 2 && (s[i+1] == '?' || s[i+1] == '!')) {
            size_t start = ++i, target_end = i; unsigned brackets = 0; unsigned char quote = 0;
            while (target_end < n && !gd_xml_space(s[target_end]) && s[target_end] != '>' && !(target_end > start && s[target_end] == '?')) target_end++;
            if (s[start] == '?') {
                while (n - i >= 2 && !(s[i] == '?' && s[i+1] == '>')) i++;
                if (n - i < 2) goto malformed;
                i++;
            } else for (; i < n; i++) {
                unsigned char c = s[i];
                if (quote) { if (c == quote) quote = 0; }
                else if (c == '\'' || c == '"') quote = c;
                else if (c == '[') brackets++;
                else if (c == ']' && brackets) brackets--;
                else if (c == '>' && !brackets) break;
            }
            if (i == n) goto malformed;
            lxb_dom_node_t *node = lxb_dom_interface_node(lxb_dom_document_create_processing_instruction(dom, s + start, target_end - start, s + start, i - start));
            if (!node) goto failed;
            if (doc->xml_flags & XML_LOWER_TAGS) {
                lexbor_str_t *target = &lxb_dom_interface_processing_instruction(node)->target;
                for (size_t j = 0; j < target->length; j++) if (target->data[j] >= 'A' && target->data[j] <= 'Z') target->data[j] += 32;
            }
            lxb_dom_node_insert_child(parent, node); i++; continue;
        }
        i++; int closing = i < n && s[i] == '/'; if (closing) i++;
        if (closing && !(doc->xml_flags & XML_LOWER_TAGS)) {
            if (parent == root) goto malformed;
            size_t length;
            const lxb_char_t *name = lxb_dom_element_qualified_name(lxb_dom_interface_element(parent), &length);
            if (length > n - i || memcmp(s + i, name, length)) goto malformed;
            i += length;
            while (i < n && gd_xml_space(s[i])) i++;
            if (i == n || s[i++] != '>') goto malformed;
            parent = parent->parent; continue;
        }
        size_t start = i;
        while (i < n && gd_xml_name_char(s[i], i == start)) i++;
        size_t length = i - start;
        if (!length) goto malformed;
        if (closing) {
            if (parent == root) goto malformed;
            size_t plen; const lxb_char_t *pname = lxb_dom_element_qualified_name(lxb_dom_interface_element(parent), &plen);
            if (plen != length) goto malformed;
            for (size_t j = 0; j < length; j++) {
                unsigned char c = s[start+j]; if ((doc->xml_flags & XML_LOWER_TAGS) && c >= 'A' && c <= 'Z') c += 32;
                if (pname[j] != c) goto malformed;
            }
            while (i < n && gd_xml_space(s[i])) i++;
            if (i == n || s[i++] != '>') goto malformed;
            parent = parent->parent; continue;
        }
        lxb_dom_element_t *element = gd_xml_element(doc, s + start, length, doc->xml_flags & XML_LOWER_TAGS);
        if (!element) goto failed;
        lxb_dom_node_insert_child(parent, &element->node);
        int self_closing = 0;
        for (;;) {
            while (i < n && gd_xml_space(s[i])) i++;
            if (i == n) goto malformed;
            if (s[i] == '>') { i++; break; }
            if (s[i] == '/' && n-i >= 2 && s[i+1] == '>') { i += 2; self_closing = 1; break; }
            start = i; while (i < n && gd_xml_name_char(s[i], i == start)) i++;
            length = i - start; if (!length) goto malformed;
            while (i < n && gd_xml_space(s[i])) i++;
            const lxb_char_t *value = (const lxb_char_t *) ""; size_t value_length = 0;
            if (i < n && s[i] == '=') {
                i++; while (i < n && gd_xml_space(s[i])) i++;
                if (i == n) goto malformed;
                unsigned char quote = s[i] == '\'' || s[i] == '"' ? s[i++] : 0;
                size_t value_start = i;
                while (i < n && (quote ? s[i] != quote : !gd_xml_space(s[i]) && s[i] != '>')) i++;
                if (i == n) goto malformed;
                value = s + value_start; value_length = i - value_start;
                if (quote) i++;
            }
            if (!gd_xml_decode(doc, &value, &value_length)) goto failed;
            lxb_dom_attr_t *attr = lxb_dom_attr_interface_create(dom);
            if (!attr) goto failed;
            if (gd_xml_attr_name(doc, attr, s + start, length, doc->xml_flags & XML_LOWER_ATTRS) != LXB_STATUS_OK || lxb_dom_attr_set_value(attr, value, value_length) != LXB_STATUS_OK) {
                lxb_dom_attr_interface_destroy(attr); goto failed;
            }
            /* Local XML IDs include the case-sensitive name mapping. */
            lxb_dom_attr_t *existing = element->first_attr;
            while (existing && existing->node.local_name != attr->node.local_name) existing = existing->next;
            if (existing) lxb_dom_attr_interface_destroy(attr);
            else if (lxb_dom_element_attr_append(element, attr) != LXB_STATUS_OK) { lxb_dom_attr_interface_destroy(attr); goto failed; }
        }
        if (!self_closing) parent = &element->node;
    }
    /* Like Cheerio/htmlparser2, accept open elements at end of input. */
    return root;
malformed:
    gd_set_error(doc, "ERR_GROVEDOM_XML", "Malformed XML input");
failed:
    gd_destroy_subtree(root);
    return NULL;
}

int gd_xml_plan(gd_document *doc, lxb_css_selector_list_t *list) {
    lxb_css_selector_t *selector = list->first;
    while (selector) {
        if (selector->ns.length) return gd_set_error(doc, "ERR_GROVEDOM_UNSUPPORTED", "Use escaped qualified XML names instead of CSS namespace syntax");
        if (selector->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS && selector->u.pseudo.type == LXB_CSS_SELECTOR_PSEUDO_CLASS_ROOT) {
            /* Lexbor treats the first document child, including a declaration,
             * as :root. Cheerio matches elements without an element parent. */
            lxb_css_selector_list_t *nested = lxb_css_selector_list_create(doc->css->memory);
            if (!nested) return 0;
            lxb_css_selector_t *parent = lxb_css_selector_create(nested), *child = lxb_css_selector_create(nested);
            if (!parent || !child) return 0;
            parent->type = child->type = LXB_CSS_SELECTOR_TYPE_ANY;
            child->combinator = LXB_CSS_SELECTOR_COMBINATOR_CHILD;
            parent->next = child; child->prev = parent;
            nested->first = parent; nested->last = child; nested->parent = selector;
            selector->type = LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS_FUNCTION;
            selector->u.pseudo.type = LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NOT;
            selector->u.pseudo.data = nested;
        }
        if (selector->type == LXB_CSS_SELECTOR_TYPE_ELEMENT || selector->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE) {
            int attr = selector->type == LXB_CSS_SELECTOR_TYPE_ATTRIBUTE;
            const lxb_char_t *raw, *key; size_t length;
            if (!gd_xml_names(doc, selector->name.data, selector->name.length, attr, doc->xml_flags & (attr ? XML_LOWER_ATTRS : XML_LOWER_TAGS), &raw, &key, &length)) return 0;
            lxb_char_t *copy = lexbor_mraw_alloc(doc->css->memory->mraw, length + 1);
            if (!copy) return 0;
            memcpy(copy, key, length + 1); selector->name.data = copy; selector->name.length = length;
            if (attr && selector->u.attribute.modifier == LXB_CSS_SELECTOR_MODIFIER_UNSET) selector->u.attribute.modifier = LXB_CSS_SELECTOR_MODIFIER_S;
        }
        lxb_css_selector_list_t *nested = NULL;
        if (selector->type == LXB_CSS_SELECTOR_TYPE_PSEUDO_CLASS_FUNCTION) {
            unsigned type = selector->u.pseudo.type;
            if (type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_HAS || type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_IS || type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NOT || type == LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_WHERE) nested = selector->u.pseudo.data;
            else if (type >= LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_CHILD && type <= LXB_CSS_SELECTOR_PSEUDO_CLASS_FUNCTION_NTH_OF_TYPE && selector->u.pseudo.data) nested = ((lxb_css_selector_anb_of_t *) selector->u.pseudo.data)->of;
        }
        if (nested && nested->first) { selector = nested->first; continue; }
        for (;;) {
            if (selector->next) { selector = selector->next; break; }
            if (selector->list->next) { selector = selector->list->next->first; break; }
            selector = selector->list->parent; if (!selector) return 1;
        }
    }
    return 1;
}

static lxb_status_t gd_xml_escape(gd_document *doc, const lxb_char_t *s, size_t n, unsigned flags) {
    if (flags & XML_RAW) return gd_write(s, n, &doc->output);
    size_t run = 0;
    for (size_t i = 0; i < n; i++) {
        const char *entity = NULL; size_t length = 0, end = i;
        unsigned char c = s[i]; char numeric[12];
        if (c == '&') { entity = "&amp;"; length = 5; }
        else if (c == '<') { entity = "&lt;"; length = 4; }
        else if (c == '>') { entity = "&gt;"; length = 4; }
        else if (c == '"') { entity = "&quot;"; length = 6; }
        else if (c == '\'') { entity = "&apos;"; length = 6; }
        else if (c >= 128) {
            uint32_t cp = c; unsigned extra = c >= 0xf0 ? 3 : c >= 0xe0 ? 2 : 1;
            if (n - i <= extra) return LXB_STATUS_ERROR;
            cp &= (1u << (6 - extra)) - 1;
            for (unsigned j = 0; j < extra; j++) cp = (cp << 6) | (s[++end] & 63);
            static const char hex[] = "0123456789abcdef";
            char digits[6]; size_t count = 0;
            do { digits[count++] = hex[cp & 15]; cp >>= 4; } while (cp);
            numeric[0] = '&'; numeric[1] = '#'; numeric[2] = 'x'; length = 3;
            while (count) numeric[length++] = digits[--count];
            numeric[length++] = ';'; entity = numeric;
        }
        if (!entity) continue;
        if (gd_write(s + run, i - run, &doc->output) != LXB_STATUS_OK || gd_write((const lxb_char_t *) entity, length, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        i = end; run = i + 1;
    }
    return gd_write(s + run, n - run, &doc->output);
}

lxb_status_t gd_xml_serialize(gd_document *doc, lxb_dom_node_t *root, unsigned flags) {
    GD_PROFILE_SCOPE(GP_XML_SERIALIZE);
    lxb_dom_node_t *node = root;
#define XML_WRITE(s, n) do { if (gd_write((const lxb_char_t *) (s), (n), &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION; } while (0)
    while (node) {
        if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
            size_t length; const lxb_char_t *name = lxb_dom_element_qualified_name(lxb_dom_interface_element(node), &length);
            XML_WRITE("<", 1); XML_WRITE(name, length);
            for (lxb_dom_attr_t *attr = lxb_dom_interface_element(node)->first_attr; attr; attr = attr->next) {
                name = lxb_dom_attr_qualified_name(attr, &length);
                XML_WRITE(" ", 1); XML_WRITE(name, length);
                {
                    XML_WRITE("=\"", 2);
                    if (attr->value && gd_xml_escape(doc, attr->value->data, attr->value->length, flags) != LXB_STATUS_OK) return LXB_STATUS_ERROR;
                    XML_WRITE("\"", 1);
                }
            }
            if (!node->first_child && !(flags & XML_PAIRED)) XML_WRITE("/", 1);
            XML_WRITE(">", 1);
        } else if (node->type == LXB_DOM_NODE_TYPE_TEXT) {
            lexbor_str_t *data = &lxb_dom_interface_character_data(node)->data;
            if (node->parent && node->parent->type == LXB_DOM_NODE_TYPE_CDATA_SECTION) { XML_WRITE(data->data, data->length); }
            else if (gd_xml_escape(doc, data->data, data->length, flags) != LXB_STATUS_OK) return LXB_STATUS_ERROR;
        } else if (node->type == LXB_DOM_NODE_TYPE_COMMENT || node->type == LXB_DOM_NODE_TYPE_PROCESSING_INSTRUCTION) {
            lexbor_str_t *data = &lxb_dom_interface_character_data(node)->data;
            int comment = node->type == LXB_DOM_NODE_TYPE_COMMENT;
            XML_WRITE(comment ? "<!--" : "<", comment ? 4 : 1); XML_WRITE(data->data, data->length); XML_WRITE(comment ? "-->" : ">", comment ? 3 : 1);
        } else if (node->type == LXB_DOM_NODE_TYPE_CDATA_SECTION) XML_WRITE("<![CDATA[", 9);
        else if (node->type == LXB_DOM_NODE_TYPE_DOCUMENT_TYPE) {
            if (lxb_html_serialize_cb(node, gd_write, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR;
        }
        if (node->first_child) { node = node->first_child; continue; }
        for (;;) {
            if (node->type == LXB_DOM_NODE_TYPE_ELEMENT && (node->first_child || (flags & XML_PAIRED))) {
                size_t length; const lxb_char_t *name = lxb_dom_element_qualified_name(lxb_dom_interface_element(node), &length);
                XML_WRITE("</", 2); XML_WRITE(name, length); XML_WRITE(">", 1);
            } else if (node->type == LXB_DOM_NODE_TYPE_CDATA_SECTION) XML_WRITE("]]>", 3);
            if (node == root) return LXB_STATUS_OK;
            if (node->next) { node = node->next; break; }
            node = node->parent;
        }
    }
#undef XML_WRITE
    return LXB_STATUS_OK;
}
