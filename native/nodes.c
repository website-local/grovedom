#include "internal.h"

int gd_valid_ids(gd_document *doc, const uint32_t *ids, size_t count) {
    for (size_t i = 0; i < count; i++) {
        if (!ids[i] || ids[i] > doc->node_count) {
            gd_set_error(doc, "ERR_GROVEDOM_HANDLE", "Invalid node handle");
            return 0;
        }
    }
    return 1;
}

uint32_t gd_id(gd_document *doc, lxb_dom_node_t *node) {
    if (node->user) return (uint32_t) (uintptr_t) node->user;
    if (doc->node_count >= UINT32_MAX) return 0;
    const size_t old_capacity = doc->node_capacity;
    if (!gd_reserve((void **) &doc->nodes, &doc->node_capacity, doc->node_count + 2, sizeof(gd_node))) return 0;
    memset(doc->nodes + old_capacity, 0, (doc->node_capacity - old_capacity) * sizeof(gd_node));
    uint32_t id = (uint32_t) ++doc->node_count;
    doc->nodes[id].node = node;
    node->user = (void *) (uintptr_t) id;
    return id;
}

void gd_results_reset(gd_document *doc) {
    doc->result_count = 0;
    if (++doc->mark == 0) {
        for (size_t i = 1; i <= doc->node_count; i++) doc->nodes[i].mark = 0;
        doc->mark = 1;
    }
}

lxb_status_t gd_collect(lxb_dom_node_t *node, lxb_css_selector_specificity_t specificity, void *context) {
    (void) specificity;
    gd_document *doc = context;
    uint32_t id = gd_id(doc, node);
    if (!id) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    if (doc->nodes[id].mark == doc->mark) return LXB_STATUS_OK;
    if (!gd_reserve((void **) &doc->results, &doc->result_capacity, doc->result_count + 1, sizeof(uint32_t))) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    doc->nodes[id].mark = doc->mark;
    doc->results[doc->result_count++] = id;
    return LXB_STATUS_OK;
}

static int gd_subtree_flag(lxb_dom_node_t *root) {
    lxb_dom_node_t *node = root;
    while (node) {
        if (node->user) return 1;
        if (node->first_child) { node = node->first_child; continue; }
        while (node != root && !node->next) node = node->parent;
        if (node == root) break;
        node = node->next;
    }
    return 0;
}

void gd_destroy_subtree(lxb_dom_node_t *root) {
    lxb_dom_node_t *node = root;
    while (node) {
        if (node->first_child) { node = node->first_child; continue; }
        lxb_dom_node_t *next = node == root ? NULL : node->next ? node->next : node->parent;
        /* Lexbor's specialized HTML destructors free the interface but omit
         * its attributes. Return them explicitly before freeing that interface. */
        if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
            lxb_dom_element_t *element = lxb_dom_interface_element(node);
            while (element->first_attr) {
                lxb_dom_attr_t *attr = element->first_attr;
                lxb_dom_element_attr_remove(element, attr);
                lxb_dom_attr_interface_destroy(attr);
            }
        }
        lxb_dom_node_destroy(node);
        node = next;
    }
}

void gd_clear_children(lxb_dom_node_t *node) {
    while (node->first_child) {
        lxb_dom_node_t *child = node->first_child;
        lxb_dom_node_remove(child);
        // Retain any subtree with exposed handles. Return others to Lexbor pools.
        if (!gd_subtree_flag(child)) gd_destroy_subtree(child);
    }
}

int gd_template(lxb_dom_node_t *node) {
    return node->type == LXB_DOM_NODE_TYPE_ELEMENT && node->ns == LXB_NS_HTML && node->local_name == LXB_TAG_TEMPLATE;
}

/* Cheerio represents template content as an ordinary fragment child. Leave
 * Lexbor's private content fragment empty and owned by its template interface;
 * exposed fragments then use normal cloning, retention and destruction. */
int gd_templates(gd_document *doc, lxb_dom_node_t *root) {
    lxb_dom_node_t *node = root;
    while (node) {
        gd_attributes_normalize(doc, node);
        if (gd_template(node)) {
            doc->templates = 1;
            lxb_dom_node_t *content = &lxb_html_interface_template(node)->content->node;
            lxb_dom_node_t *fragment = lxb_dom_interface_node(lxb_dom_document_create_document_fragment(&doc->html->dom_document));
            if (!fragment) return 0;
            while (content->first_child) {
                lxb_dom_node_t *child = content->first_child;
                lxb_dom_node_remove(child);
                lxb_dom_node_insert_child(fragment, child);
            }
            lxb_dom_node_insert_child(node, fragment);
        }
        if (node->first_child) { node = node->first_child; continue; }
        while (node != root && !node->next) node = node->parent;
        if (node == root) break;
        node = node->next;
    }
    return 1;
}


const gd_result *gk_traverse(gd_document *doc, const uint32_t *ids, size_t count, uint32_t axis) {
    GD_PROFILE_SCOPE(GP_TRAVERSE);
    if (!gd_begin(doc)) return NULL;
    if (!gd_valid_ids(doc, ids, count)) return gd_failed();
    if (axis < 1 || axis > 12) { gd_set_error(doc, "ERR_GROVEDOM_ARGUMENT", "Invalid traversal axis"); return gd_failed(); }
    gd_results_reset(doc);
    for (size_t i = 0; i < count; i++) {
        lxb_dom_node_t *origin = doc->nodes[ids[i]].node, *node = origin;
        if (axis == 2 || axis == 9 || axis == 10) node = node->parent;
        else if (axis == 4 || axis == 6 || axis == 11) node = node->next;
        else if (axis == 5 || axis == 7 || axis == 12) node = node->prev;
        else if (axis == 8) node = node->parent ? node->parent->first_child : NULL;
        else node = node->first_child;
        while (node) {
            int eligible = node != origin && (axis == 3 || axis >= 10 || node->type == LXB_DOM_NODE_TYPE_ELEMENT);
            if (eligible && gd_collect(node, 0, doc) != LXB_STATUS_OK) {
                gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Traversal allocation failed"); return gd_failed();
            }
            if (axis == 2 || (axis == 9 && node->type != LXB_DOM_NODE_TYPE_ELEMENT) || axis >= 10 || (eligible && (axis == 4 || axis == 5))) break;
            node = axis == 9 ? node->parent : (axis == 5 || axis == 7) ? node->prev : node->next;
        }
    }
    return gd_result_set(doc, GD_IDS, doc->results, doc->result_count, 0);
}
