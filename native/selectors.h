#ifndef GROVEDOM_SELECTORS_H
#define GROVEDOM_SELECTORS_H
#include "document.h"
enum { GD_SELECTOR_TEMPLATE = 1, GD_SELECTOR_CUSTOM = 2, GD_SELECTOR_ANCESTRY = 4 };
unsigned gd_selector_flags(gd_document *doc, lxb_css_selector_list_t *list);
int gd_selector_tag_case(gd_document *doc, lxb_dom_node_t *node);
int gd_selector_match(gd_document *doc, lxb_dom_node_t *node, lxb_css_selector_list_t *list);
gd_selector_guard *gd_selector_guard_create(gd_document *doc, lxb_css_selector_list_t *list);
int gd_selector_guard_prepare(gd_document *doc, int document_scope);
int gd_selector_plain_tag(const lxb_char_t *name, size_t length);
lxb_tag_id_t gd_selector_simple_tag(gd_document *doc);
int gd_selector_guard_match(gd_document *doc, lxb_dom_node_t *node);
/* During an ordinary multi-root find, order holds the first root-list index.
 * Check the reverse mapping as well: unrelated nodes can retain old indices
 * from a previous query or disconnected-tree sort. Template traversal borrows
 * order for its own result walk and must keep the general membership path. */
static inline int gd_query_root_member(gd_document *doc, const uint32_t *ids,
    size_t count, lxb_dom_node_t *node) {
    uint32_t id = (uint32_t) (uintptr_t) node->user;
    if (!id) return 0;
    uint32_t index = doc->nodes[id].order;
    return index < count && ids[index] == id;
}
#endif
