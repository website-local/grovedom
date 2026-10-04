#ifndef GROVEDOM_SERIALIZE_H
#define GROVEDOM_SERIALIZE_H
#include "document.h"

lxb_dom_attr_t *gd_attribute(lxb_dom_node_t *node, const lxb_char_t *name, size_t length);
lxb_status_t gd_write(const lxb_char_t *data, size_t length, void *context);
#endif
