#ifndef GROVEDOM_KERNEL_H
#define GROVEDOM_KERNEL_H
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <lexbor/html/html.h>
#include <lexbor/css/css.h>
#include <lexbor/selectors/selectors.h>
#include "profile.h"
enum { SET_ATTR = 1, REMOVE_ATTR, SET_TEXT, SET_HTML, APPEND_HTML, REMOVE_NODE, EMPTY_NODE };
enum { READ_ATTR = 1, READ_TEXT, READ_HTML, READ_OUTER, READ_NAME, READ_TYPE, READ_ATTRS, READ_DATA, READ_INNER_TEXT, READ_ALL_OUTER, READ_XML, READ_XML_OPTIONS };
#define PLAN_COUNT 32

enum { GD_UNDEFINED, GD_STRING, GD_NUMBER, GD_IDS, GD_NULL };
typedef struct { uint32_t kind; const void *data; size_t length; uint32_t number; } gd_result;
#ifdef __wasm__
_Static_assert(sizeof(gd_result) == 16 && offsetof(gd_result, data) == 4 && offsetof(gd_result, length) == 8 && offsetof(gd_result, number) == 12, "wasm32 result layout");
#endif
typedef struct gd_document gd_document;
typedef struct { unsigned char *data; size_t capacity, length; } gd_buffer;
typedef struct { lxb_dom_node_t *node; uint32_t mark, order; } gd_node;
typedef struct gd_selector_guard gd_selector_guard;
typedef struct gd_xml_name_entry gd_xml_name_entry;
typedef struct { char *key; size_t length; lxb_css_selector_list_t *list; unsigned flags; gd_selector_guard *guard; } gd_plan;
struct gd_document {
    lxb_html_document_t *html;
    lxb_css_parser_t *css;
    lxb_selectors_t *selectors;
    gd_plan plans[PLAN_COUNT];
    size_t plan_count;
    gd_node *nodes;
    size_t node_count, node_capacity;
    uint32_t *results;
    size_t result_count, result_capacity;
    uint32_t mark;
    gd_buffer input, output, transfer, xml_name;
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
    gd_xml_name_entry *xml_names;
    bool closed, templates, xml, selector_summary_valid, selector_custom;
};

/* Shared implementation helpers. Hidden by both builds; not binding exports. */
int gd_reserve(void **data, size_t *capacity, size_t needed, size_t item_size);
int gd_set_error(gd_document *doc, const char *code, const char *message);
lxb_status_t gd_write(const lxb_char_t *data, size_t length, void *context);
lxb_dom_attr_t *gd_attribute(lxb_dom_node_t *node, const lxb_char_t *name, size_t length);
void gd_destroy_subtree(lxb_dom_node_t *root);

void gk_init(void);
#ifdef __wasm__
void *gk_scratch(void);
#endif
gd_document *gk_new(void);
void gk_dispose(gd_document *doc);
void gk_delete(gd_document *doc);
void *gk_input(gd_document *doc, size_t length);
void *gk_transfer(gd_document *doc, size_t length);
int gk_parse(gd_document *doc, int scripting, int fragment);
int gk_parse_xml(gd_document *doc, unsigned flags);
const gd_result *gk_query(gd_document *doc, const uint32_t *ids, size_t count, int match);
const gd_result *gk_read(gd_document *doc, uint32_t operation, const uint32_t *ids, size_t count);
#ifdef __wasm__
const gd_result *gk_observe(gd_document *doc, const uint32_t *words, size_t length, const unsigned char *payload, size_t bytes,
    uint32_t operation, const uint32_t *ids, size_t count, const unsigned char *name, size_t name_length);
#endif
const gd_result *gk_traverse(gd_document *doc, const uint32_t *ids, size_t count, uint32_t axis);
const gd_result *gk_edit(gd_document *doc, uint32_t operation, const uint32_t *ids, size_t count, const uint32_t *other, size_t other_count);
int gk_execute(gd_document *doc, const uint32_t *words, size_t length, const unsigned char *payload, size_t bytes);
const size_t *gk_stats(void);
const char *gk_error_code(gd_document *doc);
const char *gk_error_message(gd_document *doc);
#endif
