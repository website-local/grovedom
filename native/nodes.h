#ifndef GROVEDOM_NODES_H
#define GROVEDOM_NODES_H
#include "document.h"

int gd_valid_ids(gd_document *doc, const uint32_t *ids, size_t count);
uint32_t gd_id(gd_document *doc, lxb_dom_node_t *node);
void gd_results_reset(gd_document *doc);
lxb_status_t gd_collect(lxb_dom_node_t *node, lxb_css_selector_specificity_t specificity, void *context);
void gd_destroy_subtree(lxb_dom_node_t *root);
void gd_clear_children(lxb_dom_node_t *node);
int gd_template(lxb_dom_node_t *node);
int gd_templates(gd_document *doc, lxb_dom_node_t *root);
#endif
