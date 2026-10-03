#ifndef GROVEDOM_SELECTORS_H
#define GROVEDOM_SELECTORS_H
#include "kernel.h"
enum { GD_SELECTOR_TEMPLATE = 1, GD_SELECTOR_TEXT = 2 };
unsigned gd_selector_flags(lxb_css_selector_list_t *list);
int gd_selector_match(gd_document *doc, lxb_dom_node_t *node, lxb_css_selector_list_t *list);
gd_selector_guard *gd_selector_guard_create(gd_document *doc, lxb_css_selector_list_t *list);
int gd_selector_guard_prepare(gd_document *doc);
int gd_selector_plain_tag(const lxb_char_t *name, size_t length);
lxb_tag_id_t gd_selector_simple_tag(gd_document *doc);
int gd_selector_guard_match(gd_document *doc, lxb_dom_node_t *node);
#endif
