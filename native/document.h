#ifndef GROVEDOM_DOCUMENT_H
#define GROVEDOM_DOCUMENT_H
#include "kernel.h"
#include <lexbor/html/html.h>
#include <lexbor/css/css.h>
#include <lexbor/selectors/selectors.h>
#include "profile.h"

typedef struct { unsigned char *data; size_t capacity, length; } gd_buffer;
typedef struct { lxb_dom_node_t *node; uint32_t mark, order; } gd_node;
typedef struct gd_selector_guard gd_selector_guard;
typedef struct gd_xml_name_entry gd_xml_name_entry;
typedef struct gd_attribute_history gd_attribute_history;
typedef struct { lxb_dom_node_t *node; const uint32_t *ids; size_t count; } gd_selector_context;
typedef struct { char *key; size_t length; lxb_css_selector_list_t *list; unsigned flags; gd_selector_guard *guard; } gd_plan;
struct gd_document {
    lxb_html_document_t *html;
    lxb_dom_element_t *insertion_context;
    lxb_css_parser_t *css;
    lxb_selectors_t *selectors;
    gd_plan plans[PLAN_COUNT];
    size_t plan_count;
    gd_node *nodes;
    size_t node_count, node_capacity;
    uint32_t *results;
    size_t result_count, result_capacity;
    uint32_t mark;
    gd_buffer input, output, transfer, xml_name, selector_text;
    gd_result result;
    const char *error_code, *error_message;
    char error_buffer[96];
    size_t bytes;
    int64_t accounted;
    unsigned xml_flags;
    unsigned selector_flags;
    uint32_t *selector_summary;
    size_t selector_guard_active;
    gd_selector_guard *selector_guard;
    gd_selector_context selector_context;
    gd_xml_name_entry *xml_names;
    gd_attribute_history *attribute_history;
    bool closed, templates, xml, selector_summary_valid, selector_custom;
};

#endif
