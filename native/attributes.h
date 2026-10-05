#ifndef GROVEDOM_ATTRIBUTES_H
#define GROVEDOM_ATTRIBUTES_H
#include "document.h"

const lxb_char_t *gd_attribute_name(gd_document *doc, lxb_dom_attr_t *attr, size_t *length);
lxb_dom_attr_t *gd_attribute(gd_document *doc, lxb_dom_node_t *node, const lxb_char_t *name, size_t length);
lxb_status_t gd_attribute_remove(gd_document *doc, lxb_dom_node_t *node, lxb_dom_attr_t *attr);
void gd_attribute_restore(gd_document *doc, lxb_dom_node_t *node, lxb_dom_attr_t *attr);
void gd_attributes_normalize(gd_document *doc, lxb_dom_node_t *node);
int gd_attributes_clone(gd_document *doc, uint32_t source_id, lxb_dom_node_t *clone);
#endif
