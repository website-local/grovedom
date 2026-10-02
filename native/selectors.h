#ifndef GROVEDOM_SELECTORS_H
#define GROVEDOM_SELECTORS_H
#include "kernel.h"
enum { GD_SELECTOR_TEMPLATE = 1, GD_SELECTOR_TEXT = 2 };
unsigned gd_selector_flags(lxb_css_selector_list_t *list);
int gd_selector_match(gd_document *doc, lxb_dom_node_t *node, lxb_css_selector_list_t *list);
#endif
