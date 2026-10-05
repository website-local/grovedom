#include "internal.h"

/* parse5's Cheerio adapter exposes adjusted foreign attributes by local name,
 * while keeping namespace/prefix metadata for serialization. XML keeps qualified
 * names. Namespace metadata also survives delete/reinsert of an attribute. */
struct gd_attribute_history {
    struct gd_attribute_history *next;
    uint32_t owner;
    const lxb_char_t *name;
    size_t length;
    lxb_dom_attr_id_t qualified;
    lxb_ns_id_t ns;
    lxb_ns_prefix_id_t prefix;
};

static int adjusted_namespace(lxb_dom_attr_t *attr) {
    return attr->node.ns == LXB_NS_XML || attr->node.ns == LXB_NS_XMLNS || attr->node.ns == LXB_NS_XLINK;
}

const lxb_char_t *gd_attribute_name(gd_document *doc, lxb_dom_attr_t *attr, size_t *length) {
    if (!doc->xml && adjusted_namespace(attr))
        return lxb_dom_attr_local_name(attr, length);
    return lxb_dom_attr_qualified_name(attr, length);
}

lxb_dom_attr_t *gd_attribute(gd_document *doc, lxb_dom_node_t *node, const lxb_char_t *name, size_t length) {
    if (node->type != LXB_DOM_NODE_TYPE_ELEMENT) return NULL;
    for (lxb_dom_attr_t *attr = lxb_dom_interface_element(node)->first_attr; attr; attr = attr->next) {
        size_t nlen;
        const lxb_char_t *key = gd_attribute_name(doc, attr, &nlen);
        if (nlen == length && memcmp(key, name, length) == 0) return attr;
    }
    return NULL;
}

lxb_status_t gd_attribute_remove(gd_document *doc, lxb_dom_node_t *node, lxb_dom_attr_t *attr) {
    if (!doc->xml && adjusted_namespace(attr)) {
        uint32_t owner = gd_id(doc, node);
        if (!owner) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        size_t length;
        const lxb_char_t *name = gd_attribute_name(doc, attr, &length);
        gd_attribute_history *entry = doc->attribute_history;
        while (entry && !(entry->owner == owner && entry->length == length && memcmp(entry->name, name, length) == 0)) entry = entry->next;
        if (!entry) {
            entry = lexbor_mraw_alloc(doc->html->dom_document.text, sizeof(*entry));
            if (!entry) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
            entry->next = doc->attribute_history; doc->attribute_history = entry;
        }
        entry->owner = owner; entry->name = name; entry->length = length;
        entry->qualified = attr->qualified_name; entry->ns = attr->node.ns; entry->prefix = attr->node.prefix;
    }
    lxb_dom_element_attr_remove(lxb_dom_interface_element(node), attr);
    lxb_dom_attr_interface_destroy(attr);
    return LXB_STATUS_OK;
}

void gd_attribute_restore(gd_document *doc, lxb_dom_node_t *node, lxb_dom_attr_t *attr) {
    if (!doc->attribute_history || !node->user) return;
    size_t length;
    const lxb_char_t *name = lxb_dom_attr_qualified_name(attr, &length);
    uint32_t owner = (uint32_t) (uintptr_t) node->user;
    for (gd_attribute_history *entry = doc->attribute_history; entry; entry = entry->next) {
        if (entry->owner == owner && entry->length == length && memcmp(entry->name, name, length) == 0) {
            attr->qualified_name = entry->qualified;
            attr->node.ns = entry->ns; attr->node.prefix = entry->prefix;
            return;
        }
    }
}

void gd_attributes_normalize(gd_document *doc, lxb_dom_node_t *node) {
    if (node->type != LXB_DOM_NODE_TYPE_ELEMENT || node->ns == LXB_NS_HTML) return;
    lxb_dom_element_t *element = lxb_dom_interface_element(node);
    lxb_dom_attr_t *namespaced = element->first_attr;
    while (namespaced && !adjusted_namespace(namespaced)) namespaced = namespaced->next;
    if (!namespaced) return;
    /* Local-name collisions retain the first property's order and the last
     * attribute's value/namespace, matching Cheerio's parse5 tree adapter. */
    for (lxb_dom_attr_t *first = element->first_attr; first; first = first->next) {
        size_t length;
        const lxb_char_t *name = gd_attribute_name(doc, first, &length);
        for (lxb_dom_attr_t *other = first->next, *next; other; other = next) {
            next = other->next;
            size_t olen;
            const lxb_char_t *oname = gd_attribute_name(doc, other, &olen);
            if (length != olen || memcmp(name, oname, length)) continue;
            lexbor_str_t *value = first->value; first->value = other->value; other->value = value;
            first->node.local_name = other->node.local_name;
            first->node.ns = other->node.ns; first->node.prefix = other->node.prefix;
            first->qualified_name = other->qualified_name; first->upper_name = other->upper_name;
            lxb_dom_element_attr_remove(element, other);
            lxb_dom_attr_interface_destroy(other);
        }
    }
}

int gd_attributes_clone(gd_document *doc, uint32_t source_id, lxb_dom_node_t *clone) {
    if (!source_id) return 1;
    for (gd_attribute_history *entry = doc->attribute_history; entry; entry = entry->next) {
        if (entry->owner != source_id) continue;
        uint32_t owner = gd_id(doc, clone);
        if (!owner) return 0;
        gd_attribute_history *copy = lexbor_mraw_alloc(doc->html->dom_document.text, sizeof(*copy));
        if (!copy) return 0;
        *copy = *entry; copy->owner = owner;
        copy->next = doc->attribute_history; doc->attribute_history = copy;
    }
    return 1;
}
