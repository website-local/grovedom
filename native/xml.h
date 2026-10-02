#ifndef GROVEDOM_XML_H
#define GROVEDOM_XML_H
#include "kernel.h"

/* Private XML implementation interface; not an external ABI. */
enum { XML_DECODE = 1, XML_LOWER_TAGS = 2, XML_LOWER_ATTRS = 4,
       XML_PAIRED = 8, XML_RAW = 16 };

lxb_dom_element_t *gd_xml_element(gd_document *doc, const lxb_char_t *name, size_t length, int lower);
lxb_status_t gd_xml_attr_name(gd_document *doc, lxb_dom_attr_t *attr, const lxb_char_t *name, size_t length, int lower);
lxb_dom_interface_t *gd_xml_clone_interface(lxb_dom_document_t *document, const lxb_dom_interface_t *source);
lxb_dom_node_t *gd_xml_parse(gd_document *doc, const lxb_char_t *source, size_t length);
int gd_xml_plan(gd_document *doc, lxb_css_selector_list_t *list);
lxb_status_t gd_xml_serialize(gd_document *doc, lxb_dom_node_t *root, unsigned flags);

#endif
