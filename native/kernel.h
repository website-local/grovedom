#ifndef GROVEDOM_KERNEL_H
#define GROVEDOM_KERNEL_H
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
enum { SET_ATTR = 1, REMOVE_ATTR, SET_TEXT, SET_HTML, APPEND_HTML, REMOVE_NODE, EMPTY_NODE };
enum { READ_ATTR = 1, READ_TEXT, READ_HTML, READ_OUTER, READ_NAME, READ_TYPE, READ_ATTRS, READ_DATA, READ_INNER_TEXT, READ_ALL_OUTER, READ_XML, READ_XML_OPTIONS };
#define PLAN_COUNT 32

enum { GD_UNDEFINED, GD_STRING, GD_NUMBER, GD_IDS, GD_NULL };
typedef struct { uint32_t kind; const void *data; size_t length; uint32_t number; } gd_result;
#ifdef __wasm__
_Static_assert(sizeof(gd_result) == 16 && offsetof(gd_result, data) == 4 && offsetof(gd_result, length) == 8 && offsetof(gd_result, number) == 12, "wasm32 result layout");
#endif
typedef struct gd_document gd_document;
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
const gd_result *gk_read(gd_document *doc, uint32_t operation, const uint32_t *ids, size_t count);
#ifdef __wasm__
const gd_result *gk_observe(gd_document *doc, const uint32_t *words, size_t length, const unsigned char *payload, size_t bytes,
    uint32_t operation, const uint32_t *ids, size_t count, const unsigned char *name, size_t name_length);
#endif
const gd_result *gk_traverse(gd_document *doc, const uint32_t *ids, size_t count, uint32_t axis);
const size_t *gk_stats(void);
const char *gk_error_code(gd_document *doc);
const char *gk_error_message(gd_document *doc);
#include "query.h"
#include "mutate.h"
#endif
