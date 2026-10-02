#include "kernel.h"
#include <stdlib.h>
#include <string.h>
#include <limits.h>

/* Track Lexbor backing allocations, not individual arena slots. The library is
 * statically linked with hidden symbols; these hooks affect only this kernel.
 * Each caller thread owns its documents, allocation scope, and counters. */
typedef union {
    max_align_t alignment;
    struct { size_t size; gd_document *owner; } value;
} gd_allocation;
static _Thread_local gd_document *gd_active;
static _Thread_local size_t gd_live_bytes, gd_peak_bytes, gd_allocations, gd_live_documents;

#ifdef __wasm__
/* Only synchronous transfers use this space. Pending operations and
 * returned results remain document-owned. Keep capacity paired with JS glue. */
static _Alignas(uint32_t) unsigned char gd_scratch[16384];
void *gk_scratch(void) { return gd_scratch; }
#endif

static void *gd_malloc(size_t size) {
    GD_PROFILE_ADD(GP_ALLOC_CALLS, 1); GD_PROFILE_ADD(GP_ALLOC_BYTES, size);
    if (!gd_active || size > SIZE_MAX - sizeof(gd_allocation)) return NULL;
    gd_allocation *allocation = malloc(sizeof(*allocation) + size);
    if (!allocation) return NULL;
    allocation->value.size = size + sizeof(*allocation);
    allocation->value.owner = gd_active;
    gd_active->bytes += allocation->value.size;
    gd_live_bytes += allocation->value.size;
    if (gd_live_bytes > gd_peak_bytes) gd_peak_bytes = gd_live_bytes;
    gd_allocations++;
    return allocation + 1;
}

static void gd_free(void *pointer) {
    if (!pointer) return;
    gd_allocation *allocation = (gd_allocation *) pointer - 1;
    allocation->value.owner->bytes -= allocation->value.size;
    gd_live_bytes -= allocation->value.size;
    free(allocation);
}

static void *gd_calloc(size_t count, size_t size) {
    if (size && count > SIZE_MAX / size) return NULL;
    void *pointer = gd_malloc(count * size);
    if (pointer) memset(pointer, 0, count * size);
    return pointer;
}

static void *gd_realloc(void *pointer, size_t size) {
    if (!pointer) return gd_malloc(size);
    GD_PROFILE_ADD(GP_ALLOC_CALLS, 1); GD_PROFILE_ADD(GP_ALLOC_BYTES, size);
    if (!size) { gd_free(pointer); return NULL; }
    if (size > SIZE_MAX - sizeof(gd_allocation)) return NULL;
    gd_allocation *old = (gd_allocation *) pointer - 1;
    const size_t old_size = old->value.size;
    gd_document *owner = old->value.owner;
    gd_allocation *next = realloc(old, size + sizeof(*next));
    if (!next) return NULL;
    next->value.size = size + sizeof(*next);
    owner->bytes = owner->bytes - old_size + next->value.size;
    gd_live_bytes = gd_live_bytes - old_size + next->value.size;
    if (gd_live_bytes > gd_peak_bytes) gd_peak_bytes = gd_live_bytes;
    gd_allocations++;
    return next + 1;
}

/* The Linux loader runs this once before any environment can use the addon.
 * Lexbor's function pointers are process-wide: never rewrite them from the
 * per-environment Node-API initializer while another worker is allocating. */
#ifndef __wasm__
__attribute__((constructor))
#endif
void gk_init(void) {
    lexbor_memory_setup(gd_malloc, gd_realloc, gd_calloc, gd_free);
}

static int gd_reserve(void **data, size_t *capacity, size_t needed, size_t item_size) {
    if (needed <= *capacity) return 1;
    size_t next = *capacity ? *capacity : 128;
    while (next < needed) {
        if (next > SIZE_MAX / 2) { next = needed; break; }
        next *= 2;
    }
    if (next > SIZE_MAX / item_size) return 0;
    void *memory = gd_realloc(*data, next * item_size);
    if (!memory) return 0;
    *data = memory;
    *capacity = next;
    return 1;
}


static int gd_error(gd_document *doc, const char *code, const char *message) {
    doc->error_code = code;
    doc->error_message = message;
    return 0;
}
static void gd_mutation_error(gd_document *doc, size_t operation) {
    /* snprintf pulls stdio and WASI descriptors into an otherwise compute-only
     * module. Format this one integer in the existing document buffer instead. */
    static const char prefix[] = "Mutation failed at operation ";
    static const char suffix[] = "; preceding effects remain";
    char digits[3 * sizeof(size_t)];
    size_t count = 0;
    _Static_assert(sizeof(((gd_document *) 0)->error_buffer) >= sizeof(prefix) - 1 + sizeof(digits) + sizeof(suffix), "mutation error capacity");
    do { digits[count++] = (char) ('0' + operation % 10); operation /= 10; } while (operation);
    char *next = doc->error_buffer;
    memcpy(next, prefix, sizeof(prefix) - 1); next += sizeof(prefix) - 1;
    while (count) *next++ = digits[--count];
    memcpy(next, suffix, sizeof(suffix));
    gd_error(doc, "ERR_GROVEDOM_MUTATION", doc->error_buffer);
}
static int gd_begin(gd_document *doc) {
    doc->error_code = doc->error_message = NULL;
    if (doc->closed) return gd_error(doc, "ERR_GROVEDOM_DISPOSED", "Document has been disposed");
    gd_active = doc;
    return 1;
}
static const gd_result *gd_result_set(gd_document *doc, uint32_t kind, const void *data, size_t length, uint32_t number) {
    doc->result = (gd_result) { kind, data, length, number };
    gd_active = NULL;
    return &doc->result;
}
static const gd_result *gd_failed(void) { gd_active = NULL; return NULL; }
const char *gk_error_code(gd_document *doc) { return doc->error_code; }
const char *gk_error_message(gd_document *doc) { return doc->error_message; }

static void gd_release(gd_document *doc) {
    GD_PROFILE_SCOPE(GP_DISPOSE);
    if (doc->closed) return;
    doc->closed = 1;
    if (doc->selectors) lxb_selectors_destroy(doc->selectors, true);
    if (doc->css) {
        lxb_css_memory_destroy(doc->css->memory, true);
        lxb_css_parser_selectors_destroy(doc->css);
        lxb_css_parser_destroy(doc->css, true);
    }
    if (doc->html) lxb_html_document_destroy(doc->html);
    gd_free(doc->nodes);
    gd_free(doc->results);
    gd_free(doc->input.data);
    gd_free(doc->output.data);
    gd_free(doc->transfer.data);
    doc->html = NULL;
    doc->css = NULL;
    doc->selectors = NULL;
    doc->nodes = NULL;
    doc->results = NULL;
    doc->input.data = doc->output.data = doc->transfer.data = NULL;
    gd_live_documents--;
}

void gk_dispose(gd_document *doc) { gd_release(doc); }
void gk_delete(gd_document *doc) { if (doc) { gd_release(doc); free(doc); } }
void *gk_input(gd_document *doc, size_t length) {
    if (!gd_begin(doc)) return NULL;
    if (length >= UINT32_MAX || !gd_reserve((void **) &doc->input.data, &doc->input.capacity, length + 1, 1)) {
        gd_error(doc, "ERR_GROVEDOM_MEMORY", "Input allocation failed"); gd_active = NULL; return NULL;
    }
    doc->input.length = length;
    doc->input.data[length] = 0;
    gd_active = NULL;
    return doc->input.data;
}
void *gk_transfer(gd_document *doc, size_t length) {
    if (!gd_begin(doc)) return NULL;
    if (!gd_reserve((void **) &doc->transfer.data, &doc->transfer.capacity, length ? length : 1, 1)) {
        gd_error(doc, "ERR_GROVEDOM_MEMORY", "Transfer allocation failed"); gd_active = NULL; return NULL;
    }
    gd_active = NULL;
    return doc->transfer.data;
}

static int gd_valid_ids(gd_document *doc, const uint32_t *ids, size_t count) {
    for (size_t i = 0; i < count; i++) {
        if (!ids[i] || ids[i] > doc->node_count) {
            gd_error(doc, "ERR_GROVEDOM_HANDLE", "Invalid node handle");
            return 0;
        }
    }
    return 1;
}

static uint32_t gd_id(gd_document *doc, lxb_dom_node_t *node) {
    if (node->user) return (uint32_t) (uintptr_t) node->user;
    if (doc->node_count >= UINT32_MAX) return 0;
    const size_t old_capacity = doc->node_capacity;
    if (!gd_reserve((void **) &doc->nodes, &doc->node_capacity, doc->node_count + 2, sizeof(gd_node))) return 0;
    memset(doc->nodes + old_capacity, 0, (doc->node_capacity - old_capacity) * sizeof(gd_node));
    uint32_t id = (uint32_t) ++doc->node_count;
    doc->nodes[id].node = node;
    node->user = (void *) (uintptr_t) id;
    return id;
}

static void gd_results_reset(gd_document *doc) {
    doc->result_count = 0;
    if (++doc->mark == 0) {
        for (size_t i = 1; i <= doc->node_count; i++) doc->nodes[i].mark = 0;
        doc->mark = 1;
    }
}

static lxb_status_t gd_collect(lxb_dom_node_t *node, lxb_css_selector_specificity_t specificity, void *context) {
    (void) specificity;
    gd_document *doc = context;
    uint32_t id = gd_id(doc, node);
    if (!id) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    if (doc->nodes[id].mark == doc->mark) return LXB_STATUS_OK;
    if (!gd_reserve((void **) &doc->results, &doc->result_capacity, doc->result_count + 1, sizeof(uint32_t))) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    doc->nodes[id].mark = doc->mark;
    doc->results[doc->result_count++] = id;
    return LXB_STATUS_OK;
}

static lxb_status_t gd_write(const lxb_char_t *data, size_t length, void *context) {
    GD_PROFILE_ADD(GP_OUTPUT_CHUNKS, 1); GD_PROFILE_ADD(GP_OUTPUT_BYTES, length);
    gd_buffer *buffer = context;
    if (length > SIZE_MAX - buffer->length ||
        !gd_reserve((void **) &buffer->data, &buffer->capacity, buffer->length + length, 1)) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    if (length) memcpy(buffer->data + buffer->length, data, length);
    buffer->length += length;
    return LXB_STATUS_OK;
}

static lxb_status_t gd_text(gd_document *doc, lxb_dom_node_t *root, int inner_text) {
    lxb_dom_node_t *node = root;
    while (node) {
        if (node->type == LXB_DOM_NODE_TYPE_TEXT || node->type == LXB_DOM_NODE_TYPE_CDATA_SECTION) {
            lexbor_str_t *data = &lxb_dom_interface_character_data(node)->data;
            lxb_status_t status = gd_write(data->data, data->length, &doc->output);
            if (status != LXB_STATUS_OK) return status;
        }
        if (node->first_child && !(inner_text && node->type == LXB_DOM_NODE_TYPE_ELEMENT && (node->local_name == LXB_TAG_SCRIPT || node->local_name == LXB_TAG_STYLE))) { node = node->first_child; continue; }
        while (node != root && !node->next) node = node->parent;
        if (node == root) break;
        node = node->next;
    }
    return LXB_STATUS_OK;
}

static lxb_dom_attr_t *gd_attribute(lxb_dom_node_t *node, const lxb_char_t *name, size_t length) {
    if (node->type != LXB_DOM_NODE_TYPE_ELEMENT) return NULL;
    for (lxb_dom_attr_t *attr = lxb_dom_interface_element(node)->first_attr; attr; attr = attr->next) {
        size_t nlen;
        const lxb_char_t *key = lxb_dom_attr_qualified_name(attr, &nlen);
        if (nlen == length && memcmp(key, name, length) == 0) return attr;
    }
    return NULL;
}

static lxb_status_t gd_json(gd_document *doc, const lxb_char_t *data, size_t length) {
    if (gd_write((const lxb_char_t *) "\"", 1, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    for (size_t i = 0; i < length; i++) {
        unsigned char c = data[i];
        if (c == '"' || c == '\\') {
            const lxb_char_t escaped[] = { '\\', c };
            if (gd_write(escaped, 2, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        } else if (c < 32) {
            const char hex[] = "0123456789abcdef";
            const lxb_char_t escaped[] = { '\\', 'u', '0', '0', hex[c >> 4], hex[c & 15] };
            if (gd_write(escaped, 6, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        } else if (gd_write(data + i, 1, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    }
    return gd_write((const lxb_char_t *) "\"", 1, &doc->output);
}

static int gd_subtree_flag(lxb_dom_node_t *root, int handles) {
    lxb_dom_node_t *node = root;
    while (node) {
        if (handles ? node->user != NULL : (node->type == LXB_DOM_NODE_TYPE_ELEMENT && node->local_name == LXB_TAG_TEMPLATE)) return 1;
        if (node->first_child) { node = node->first_child; continue; }
        while (node != root && !node->next) node = node->parent;
        if (node == root) break;
        node = node->next;
    }
    return 0;
}

static void gd_clear_children(lxb_dom_node_t *node) {
    while (node->first_child) {
        lxb_dom_node_t *child = node->first_child;
        lxb_dom_node_remove(child);
        // Retain any subtree with exposed handles. Return others to Lexbor pools.
        if (!gd_subtree_flag(child, 1)) lxb_dom_node_destroy_deep(child);
    }
}

static void gd_plans_clean(gd_document *doc) {
    /* Plans never escape a synchronous query; selections hold only node IDs.
     * Reset the whole bounded cache so keys and ASTs can share one arena. */
    doc->plan_count = 0;
    lxb_css_parser_erase(doc->css);
    lxb_css_selectors_clean(doc->css->selectors);
}

static lxb_css_selector_list_t *gd_plan_get(gd_document *doc) {
    GD_PROFILE_SCOPE(GP_PLAN);
    for (size_t i = 0; i < doc->plan_count; i++) {
        gd_plan *plan = &doc->plans[i];
        if (plan->length == doc->input.length &&
            memcmp(plan->key, doc->input.data, plan->length) == 0) { GD_PROFILE_ADD(GP_PLAN_HITS, 1); return plan->list; }
    }
    GD_PROFILE_ADD(GP_PLAN_MISSES, 1);
    if (doc->plan_count == PLAN_COUNT) gd_plans_clean(doc);
    if (!doc->css->memory) {
        doc->css->memory = lxb_css_memory_create();
        if (lxb_css_memory_init(doc->css->memory, 256) != LXB_STATUS_OK) {
            doc->css->memory = lxb_css_memory_destroy(doc->css->memory, true);
            goto memory_error;
        }
    }
    if (!doc->css->selectors && lxb_css_parser_selectors_init(doc->css) != LXB_STATUS_OK) goto memory_error;
    lxb_css_log_clean(doc->css->log);
    lxb_css_selector_list_t *list = lxb_css_selectors_parse(doc->css, doc->input.data, doc->input.length);
    int valid = list && doc->css->status == LXB_STATUS_OK && lxb_css_log_length(doc->css->log) == 0;
    if (!valid) {
        gd_plans_clean(doc);
        gd_error(doc, "ERR_GROVEDOM_SELECTOR", "Invalid or unsupported CSS selector");
        return NULL;
    }
    char *key = lexbor_mraw_alloc(doc->css->memory->mraw, doc->input.length + 1);
    if (!key) { gd_plans_clean(doc); goto memory_error; }
    memcpy(key, doc->input.data, doc->input.length + 1);
    gd_plan *plan = &doc->plans[doc->plan_count++];
    *plan = (gd_plan) { key, doc->input.length, list };
    return list;
memory_error:
    gd_error(doc, "ERR_GROVEDOM_MEMORY", "Selector allocation failed");
    return NULL;
}

gd_document *gk_new(void) {
    GD_PROFILE_SCOPE(GP_CREATE);
    gd_document *doc = calloc(1, sizeof(*doc));
    if (!doc) return NULL;
    gd_live_documents++;
    gd_active = doc;
    doc->html = lxb_html_document_create();
    doc->css = lxb_css_parser_create();
    doc->selectors = lxb_selectors_create();
    if (!doc->html || !doc->css || !doc->selectors ||
        lxb_css_parser_init(doc->css, NULL) != LXB_STATUS_OK ||
        lxb_selectors_init(doc->selectors) != LXB_STATUS_OK) {
        gk_delete(doc); gd_active = NULL; return NULL;
    }
    lxb_selectors_opt_set(doc->selectors, LXB_SELECTORS_OPT_MATCH_FIRST);
    gd_active = NULL;
    return doc;
}
static int gd_parse(gd_document *doc, int scripting, int fragment, int allow_templates) {
    GD_PROFILE_SCOPE(GP_PARSE);
    if (!gd_begin(doc)) return 0;
    if (doc->node_count) { gd_error(doc, "ERR_GROVEDOM_ARGUMENT", "Document already parsed"); goto failed; }
    lxb_html_document_scripting_set(doc->html, scripting);
    lxb_dom_node_t *root = lxb_dom_interface_node(doc->html);
    if (fragment) {
        lxb_dom_element_t *context = lxb_dom_document_create_element(&doc->html->dom_document, (const lxb_char_t *) "body", 4, NULL);
        if (!context) goto failed;
        lxb_dom_node_t *parsed = lxb_html_document_parse_fragment(doc->html, context, doc->input.data, doc->input.length);
        lxb_dom_node_destroy(lxb_dom_interface_node(context));
        if (!parsed) goto failed;
        while (parsed->first_child) {
            lxb_dom_node_t *child = parsed->first_child;
            lxb_dom_node_remove(child);
            lxb_dom_node_insert_child(root, child);
        }
        lxb_dom_node_destroy(parsed);
    } else if (lxb_html_document_parse(doc->html, doc->input.data, doc->input.length) != LXB_STATUS_OK) goto failed;
    if (!allow_templates && gd_subtree_flag(root, 0)) { gd_error(doc, "ERR_GROVEDOM_UNSUPPORTED", "Template contents are not supported by this prototype"); goto failed; }
    gd_free(doc->input.data);
    doc->input = (gd_buffer) {0};
    if (!gd_id(doc, root)) goto failed;
    gd_active = NULL;
    return 1;
failed:
    if (!doc->error_code) gd_error(doc, "ERR_GROVEDOM_MEMORY", "Document creation failed");
    gd_active = NULL;
    return 0;
}
int gk_parse(gd_document *doc, int scripting, int fragment) { return gd_parse(doc, scripting, fragment, 0); }
#ifdef GROVEDOM_PROFILE_GROWTH
/* Parsing-only diagnostic: include template allocations on unmodified pages.
 * This entry point is absent from production builds and exposes no DOM API. */
int gk_parse_profile(gd_document *doc) { return gd_parse(doc, 1, 0, 1); }
#endif
const gd_result *gk_query(gd_document *doc, const uint32_t *ids, size_t count, int match) {
    GD_PROFILE_SCOPE(GP_QUERY);
    if (!gd_begin(doc)) return NULL;
    if (!gd_valid_ids(doc, ids, count)) return gd_failed();
    lxb_css_selector_list_t *plan = gd_plan_get(doc);
    if (!plan) return gd_failed();
    gd_results_reset(doc);
    for (size_t i = 0; i < count; i++) {
        lxb_dom_node_t *node = doc->nodes[ids[i]].node;
        if (match && node->type != LXB_DOM_NODE_TYPE_ELEMENT) continue;
        lxb_status_t status = match ? lxb_selectors_match_node(doc->selectors, node, plan, gd_collect, doc) : lxb_selectors_find(doc->selectors, node, plan, gd_collect, doc);
        if (status != LXB_STATUS_OK) { gd_error(doc, "ERR_GROVEDOM_SELECTOR", "Selector execution failed"); return gd_failed(); }
    }
    return gd_result_set(doc, GD_IDS, doc->results, doc->result_count, 0);
}
const gd_result *gk_read(gd_document *doc, uint32_t operation, const uint32_t *ids, size_t count) {
    GD_PROFILE_SCOPE(operation == READ_ATTR ? GP_READ_ATTR : operation == READ_TEXT || operation == READ_INNER_TEXT ? GP_READ_TEXT : operation == READ_HTML || operation == READ_OUTER || operation == READ_ALL_OUTER ? GP_READ_HTML : GP_READ_OTHER);
    if (!gd_begin(doc)) return NULL;
    if (!gd_valid_ids(doc, ids, count)) return gd_failed();
    lxb_dom_node_t *node = count ? doc->nodes[ids[0]].node : NULL;
    const lxb_char_t *data = NULL;
    size_t length = 0;
    lxb_status_t status = LXB_STATUS_OK;
    doc->output.length = 0;
    if (operation == READ_TYPE) return gd_result_set(doc, GD_NUMBER, NULL, 0, node ? node->type : 0);
    if (operation == READ_ATTR) {
        if (node && node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
            lxb_dom_attr_t *attr = gd_attribute(node, doc->input.data, doc->input.length);
            if (attr) { data = attr->value ? attr->value->data : (const lxb_char_t *) ""; length = attr->value ? attr->value->length : 0; }
        }
        if (!data) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
    } else if (operation == READ_NAME) {
        if (node && node->type == LXB_DOM_NODE_TYPE_ELEMENT) data = lxb_dom_element_local_name(lxb_dom_interface_element(node), &length);
        if (!data) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
    } else if (operation == READ_ATTRS) {
        if (!node || node->type != LXB_DOM_NODE_TYPE_ELEMENT) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
        status = gd_write((const lxb_char_t *) "{", 1, &doc->output);
        for (lxb_dom_attr_t *attr = lxb_dom_interface_element(node)->first_attr; attr && status == LXB_STATUS_OK; attr = attr->next) {
            size_t nlen;
            const lxb_char_t *name = lxb_dom_attr_qualified_name(attr, &nlen);
            if (attr != lxb_dom_interface_element(node)->first_attr) status = gd_write((const lxb_char_t *) ",", 1, &doc->output);
            if (status == LXB_STATUS_OK) status = gd_json(doc, name, nlen);
            if (status == LXB_STATUS_OK) status = gd_write((const lxb_char_t *) ":", 1, &doc->output);
            if (status == LXB_STATUS_OK) status = gd_json(doc, attr->value ? attr->value->data : NULL, attr->value ? attr->value->length : 0);
        }
        if (status == LXB_STATUS_OK) status = gd_write((const lxb_char_t *) "}", 1, &doc->output);
    } else if (operation == READ_DATA) {
        if (!node || (node->type != LXB_DOM_NODE_TYPE_TEXT && node->type != LXB_DOM_NODE_TYPE_COMMENT && node->type != LXB_DOM_NODE_TYPE_CDATA_SECTION)) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
        lexbor_str_t *str = &lxb_dom_interface_character_data(node)->data;
        data = str->data; length = str->length;
    } else if (operation == READ_TEXT || operation == READ_INNER_TEXT) {
        for (size_t i = 0; i < count && status == LXB_STATUS_OK; i++) status = gd_text(doc, doc->nodes[ids[i]].node, operation == READ_INNER_TEXT);
    } else if (operation == READ_ALL_OUTER) {
        for (size_t i = 0; i < count && status == LXB_STATUS_OK; i++) status = lxb_html_serialize_tree_cb(doc->nodes[ids[i]].node, gd_write, &doc->output);
    } else if (operation == READ_HTML || operation == READ_OUTER) {
        if (!node || (operation == READ_HTML && node->type != LXB_DOM_NODE_TYPE_ELEMENT && node->type != LXB_DOM_NODE_TYPE_DOCUMENT)) return gd_result_set(doc, GD_NULL, NULL, 0, 0);
        status = operation == READ_HTML ? lxb_html_serialize_deep_cb(node, gd_write, &doc->output) : lxb_html_serialize_tree_cb(node, gd_write, &doc->output);
    } else { gd_error(doc, "ERR_GROVEDOM_ARGUMENT", "Unknown read operation"); return gd_failed(); }
    if (status != LXB_STATUS_OK) { gd_error(doc, "ERR_GROVEDOM_MEMORY", "Output allocation failed"); return gd_failed(); }
    if (!data) { data = doc->output.data; length = doc->output.length; }
    return gd_result_set(doc, GD_STRING, data, length, 0);
}
const gd_result *gk_traverse(gd_document *doc, const uint32_t *ids, size_t count, uint32_t axis) {
    GD_PROFILE_SCOPE(GP_TRAVERSE);
    if (!gd_begin(doc)) return NULL;
    if (!gd_valid_ids(doc, ids, count)) return gd_failed();
    if (axis < 1 || axis > 12) { gd_error(doc, "ERR_GROVEDOM_ARGUMENT", "Invalid traversal axis"); return gd_failed(); }
    gd_results_reset(doc);
    for (size_t i = 0; i < count; i++) {
        lxb_dom_node_t *origin = doc->nodes[ids[i]].node, *node = origin;
        if (axis == 2 || axis == 9 || axis == 10) node = node->parent;
        else if (axis == 4 || axis == 6 || axis == 11) node = node->next;
        else if (axis == 5 || axis == 7 || axis == 12) node = node->prev;
        else if (axis == 8) node = node->parent ? node->parent->first_child : NULL;
        else node = node->first_child;
        while (node) {
            int eligible = node != origin && (axis == 3 || axis >= 10 || node->type == LXB_DOM_NODE_TYPE_ELEMENT);
            if (eligible && gd_collect(node, 0, doc) != LXB_STATUS_OK) {
                gd_error(doc, "ERR_GROVEDOM_MEMORY", "Traversal allocation failed"); return gd_failed();
            }
            if (axis == 2 || axis >= 10 || (eligible && (axis == 4 || axis == 5))) break;
            node = axis == 9 ? node->parent : (axis == 5 || axis == 7) ? node->prev : node->next;
        }
    }
    return gd_result_set(doc, GD_IDS, doc->results, doc->result_count, 0);
}

static lxb_dom_node_t *gd_fragment(gd_document *doc, lxb_dom_node_t *context_node) {
    int temporary = !context_node || context_node->type != LXB_DOM_NODE_TYPE_ELEMENT;
    lxb_dom_element_t *context = temporary ? lxb_dom_document_create_element(&doc->html->dom_document, (const lxb_char_t *) "body", 4, NULL) : lxb_dom_interface_element(context_node);
    if (!context) return NULL;
    lxb_dom_node_t *fragment = lxb_html_document_parse_fragment(doc->html, context, doc->input.data, doc->input.length);
    if (temporary) lxb_dom_node_destroy(lxb_dom_interface_node(context));
    if (fragment && gd_subtree_flag(fragment, 0)) {
        lxb_dom_node_destroy_deep(fragment);
        gd_error(doc, "ERR_GROVEDOM_UNSUPPORTED", "Template contents are not supported by this prototype");
        return NULL;
    }
    return fragment;
}

static lxb_dom_node_t *gd_clone(lxb_dom_node_t *source) {
    lxb_dom_node_t *root = lxb_dom_node_clone(source, true), *node = root;
    // Lexbor copies user fields. Clones must receive their own GroveDOM IDs.
    while (node) {
        node->user = NULL;
        if (node->first_child) { node = node->first_child; continue; }
        while (node != root && !node->next) node = node->parent;
        if (node == root) break;
        node = node->next;
    }
    return root;
}

static int gd_insert(gd_document *doc, lxb_dom_node_t *target, lxb_dom_node_t *child, unsigned position, lxb_dom_node_t **anchor, int collect) {
    if (child == target) return 1;
    lxb_dom_node_t *parent = position < 2 ? target : target->parent;
    if (!parent) return 1;
    for (lxb_dom_node_t *node = parent; node; node = node->parent) {
        if (node == child) return gd_error(doc, "ERR_GROVEDOM_MUTATION", "Insertion would create a node cycle");
    }
    if (child->type == LXB_DOM_NODE_TYPE_DOCUMENT || (parent->type != LXB_DOM_NODE_TYPE_ELEMENT && parent->type != LXB_DOM_NODE_TYPE_DOCUMENT && parent->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT)) return gd_error(doc, "ERR_GROVEDOM_MUTATION", "Invalid insertion target");
    if (child == *anchor && position == 1) *anchor = child->next;
    lxb_dom_node_remove(child);
    if (position == 0 || (position == 1 && !*anchor)) lxb_dom_node_insert_child(parent, child);
    else if (position == 1 || position == 2) lxb_dom_node_insert_before(*anchor, child);
    else { lxb_dom_node_insert_after(*anchor, child); *anchor = child; }
    return !collect || gd_collect(child, 0, doc) == LXB_STATUS_OK;
}

static int gd_order_compare(const void *left, const void *right) {
    uint32_t a_id = *(const uint32_t *) left, b_id = *(const uint32_t *) right;
    lxb_dom_node_t *a = gd_active->nodes[a_id].node, *b = gd_active->nodes[b_id].node;
    if (a == b) return 0;
    size_t ad = 0, bd = 0;
    lxb_dom_node_t *ar = a, *br = b;
    while (ar->parent) { ad++; ar = ar->parent; }
    while (br->parent) { bd++; br = br->parent; }
    if (ar != br) return gd_active->nodes[a_id].order < gd_active->nodes[b_id].order ? -1 : 1;
    while (ad > bd) { if (a->parent == b) return 1; a = a->parent; ad--; }
    while (bd > ad) { if (b->parent == a) return -1; b = b->parent; bd--; }
    while (a->parent != b->parent) { a = a->parent; b = b->parent; }
    for (lxb_dom_node_t *node = a->next; node; node = node->next) if (node == b) return -1;
    return 1;
}

static lxb_dom_node_t *gd_root(lxb_dom_node_t *node) {
    while (node->parent) node = node->parent;
    return node;
}

const gd_result *gk_edit(gd_document *doc, uint32_t operation, const uint32_t *ids, size_t count, const uint32_t *other, size_t other_count) {
    GD_PROFILE_SCOPE(GP_EDIT);
    if (!gd_begin(doc)) return NULL;
    if (!gd_valid_ids(doc, ids, count) || !gd_valid_ids(doc, other, other_count)) return gd_failed();
    gd_results_reset(doc);
    int collect = (operation & 256) != 0;
    operation &= ~256U;
    if (operation == 1) {
        lxb_dom_node_t *fragment = gd_fragment(doc, count ? doc->nodes[ids[0]].node : NULL);
        if (!fragment) goto failed;
        lxb_dom_node_t *root = lxb_dom_interface_node(lxb_dom_document_create_document_fragment(&doc->html->dom_document));
        if (!root) { lxb_dom_node_destroy_deep(fragment); goto failed; }
        while (fragment->first_child) {
            lxb_dom_node_t *child = fragment->first_child;
            lxb_dom_node_remove(child);
            lxb_dom_node_insert_child(root, child);
            if (gd_collect(child, 0, doc) != LXB_STATUS_OK) { lxb_dom_node_destroy_deep(fragment); goto failed; }
        }
        lxb_dom_node_destroy(fragment);
    } else if (operation == 2 || operation == 13) {
        for (size_t i = 0; i < count; i++) {
            lxb_dom_node_t *node = operation == 2 ? gd_clone(doc->nodes[ids[i]].node) : doc->nodes[ids[i]].node;
            if (!node || gd_collect(node, 0, doc) != LXB_STATUS_OK) goto failed;
        }
        if (operation == 13) {
            /* Group disconnected roots by first occurrence. A consistent root
             * rank keeps the comparator transitive; connected nodes use tree
             * order. No extra allocation or node IDs are needed for sorting. */
            lxb_dom_node_t *first_root = doc->result_count ? gd_root(doc->nodes[doc->results[0]].node) : NULL;
            for (size_t i = 0; i < doc->result_count; i++) {
                gd_node *item = &doc->nodes[doc->results[i]];
                lxb_dom_node_t *root = gd_root(item->node);
                item->order = root == first_root ? 0 : (uint32_t) i;
                if (root != first_root) for (size_t j = 1; j < i; j++) {
                    gd_node *prior = &doc->nodes[doc->results[j]];
                    if (gd_root(prior->node) == root) { item->order = prior->order; break; }
                }
            }
            qsort(doc->results, doc->result_count, sizeof(uint32_t), gd_order_compare);
        }
    } else if (operation >= 3 && operation <= 10) {
        unsigned position = operation <= 7 ? (operation == 7 ? 2 : operation - 3) : operation - 7;
        for (size_t i = 0; i < count; i++) {
            lxb_dom_node_t *target = doc->nodes[ids[i]].node;
            if (position >= 2 && !target->parent) continue;
            lxb_dom_node_t *anchor = position == 1 ? target->first_child : target;
            if (operation <= 7) {
                for (size_t j = 0; j < other_count; j++) {
                    lxb_dom_node_t *child = doc->nodes[other[j]].node;
                    if (i + 1 < count) child = gd_clone(child);
                    if (!child || !gd_insert(doc, target, child, position, &anchor, collect)) goto failed;
                }
                if (operation == 7) {
                    int keep = 0;
                    for (size_t j = 0; j < other_count; j++) if (doc->nodes[other[j]].node == target) { keep = 1; break; }
                    if (!keep) lxb_dom_node_remove(target);
                }
            } else {
                lxb_dom_node_t *fragment = gd_fragment(doc, position == 1 ? target : target->parent);
                if (!fragment) goto failed;
                while (fragment->first_child) {
                    lxb_dom_node_t *child = fragment->first_child;
                    if (!gd_insert(doc, target, child, position, &anchor, 0)) { lxb_dom_node_destroy_deep(fragment); goto failed; }
                }
                lxb_dom_node_destroy(fragment);
            }
        }
    } else if (operation == 11 || operation == 12) {
        for (size_t i = 0; i < count; i++) {
            lxb_dom_node_t *node = doc->nodes[ids[i]].node;
            if (operation == 12) {
                if (node->type == LXB_DOM_NODE_TYPE_TEXT || node->type == LXB_DOM_NODE_TYPE_COMMENT || node->type == LXB_DOM_NODE_TYPE_CDATA_SECTION) {
                    lxb_dom_character_data_t *data = lxb_dom_interface_character_data(node);
                    if (lxb_dom_character_data_replace(data, doc->input.data, doc->input.length, 0, data->data.length) != LXB_STATUS_OK) goto failed;
                }
            } else if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
                lxb_dom_element_t *element = lxb_dom_document_create_element(&doc->html->dom_document, doc->input.data, doc->input.length, NULL);
                if (!element) goto failed;
                lxb_dom_node_t *replacement = lxb_dom_interface_node(element);
                if (replacement->local_name == LXB_TAG_TEMPLATE) { lxb_dom_node_destroy(replacement); gd_error(doc, "ERR_GROVEDOM_UNSUPPORTED", "Template contents are not supported by this prototype"); goto failed; }
                lxb_dom_element_t *old = lxb_dom_interface_element(node);
                while (old->first_attr) {
                    lxb_dom_attr_t *attr = old->first_attr;
                    lxb_dom_element_attr_remove(old, attr);
                    lxb_dom_element_attr_append(element, attr);
                }
                while (node->first_child) { lxb_dom_node_t *child = node->first_child; lxb_dom_node_remove(child); lxb_dom_node_insert_child(replacement, child); }
                if (node->parent) lxb_dom_node_insert_before(node, replacement);
                lxb_dom_node_remove(node);
                replacement->user = node->user; node->user = NULL;
                doc->nodes[ids[i]].node = replacement;
                // Parser side pointers can still reference the original interface.
                // Keep that detached interface in its document arena until disposal.
            }
        }
    } else { gd_error(doc, "ERR_GROVEDOM_ARGUMENT", "Unknown edit operation"); return gd_failed(); }
    return gd_result_set(doc, operation == 1 || operation == 2 || operation == 13 || collect ? GD_IDS : GD_UNDEFINED, doc->results, doc->result_count, 0);
failed:
    if (!doc->error_code) gd_error(doc, "ERR_GROVEDOM_MEMORY", "Edit allocation failed");
    return gd_failed();
}

static lxb_status_t gd_mutate(gd_document *doc, uint32_t operation, lxb_dom_node_t *node,
                             const lxb_char_t *a, size_t alen, const lxb_char_t *b, size_t blen) {
    if (operation == REMOVE_NODE) { lxb_dom_node_remove(node); return LXB_STATUS_OK; }
    if (node->type != LXB_DOM_NODE_TYPE_ELEMENT && node->type != LXB_DOM_NODE_TYPE_DOCUMENT) return LXB_STATUS_OK;
    if (operation == SET_ATTR || operation == REMOVE_ATTR) {
        if (node->type != LXB_DOM_NODE_TYPE_ELEMENT) return LXB_STATUS_OK;
        if (!alen) return LXB_STATUS_ERROR_WRONG_ARGS;
        lxb_dom_attr_t *attr = gd_attribute(node, a, alen);
        if (operation == REMOVE_ATTR) {
            if (attr) { lxb_dom_element_attr_remove(lxb_dom_interface_element(node), attr); lxb_dom_attr_interface_destroy(attr); }
            return LXB_STATUS_OK;
        }
        if (attr) {
            if (attr->value && attr->value->data && lexbor_str_size(attr->value) > blen) {
                memcpy(attr->value->data, b, blen); attr->value->data[blen] = 0; attr->value->length = blen;
                return LXB_STATUS_OK;
            }
            return lxb_dom_attr_set_value(attr, b, blen);
        }
        attr = lxb_dom_attr_interface_create(&doc->html->dom_document);
        if (!attr) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        if (lxb_dom_attr_set_name(attr, a, alen, false) != LXB_STATUS_OK || lxb_dom_attr_set_value(attr, b, blen) != LXB_STATUS_OK) { lxb_dom_attr_interface_destroy(attr); return LXB_STATUS_ERROR_MEMORY_ALLOCATION; }
        return lxb_dom_element_attr_append(lxb_dom_interface_element(node), attr);
    }
    if (operation == SET_TEXT) {
        lxb_dom_node_t *old = node->first_child;
        if (alen && old && old == node->last_child && old->type == LXB_DOM_NODE_TYPE_TEXT && !old->user) {
            return lxb_dom_character_data_replace(lxb_dom_interface_character_data(old), a, alen, 0, 0);
        }
        lxb_dom_node_t *text = NULL;
        if (alen) {
            text = lxb_dom_interface_node(lxb_dom_document_create_text_node(&doc->html->dom_document, a, alen));
            if (!text) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        }
        gd_clear_children(node);
        if (text) lxb_dom_node_insert_child(node, text);
        return LXB_STATUS_OK;
    }
    if (operation == SET_HTML || operation == APPEND_HTML) {
        /* Detach old nodes instead of Lexbor's inner_html_set, which destroys
         * them and would invalidate selections that still refer to them. */
        lxb_dom_element_t *context = node->type == LXB_DOM_NODE_TYPE_ELEMENT ? lxb_dom_interface_element(node) : lxb_dom_document_create_element(&doc->html->dom_document, (const lxb_char_t *) "body", 4, NULL);
        if (!context) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        lxb_dom_node_t *fragment = lxb_html_document_parse_fragment(doc->html, context, a, alen);
        if (node->type == LXB_DOM_NODE_TYPE_DOCUMENT) lxb_dom_node_destroy(lxb_dom_interface_node(context));
        if (!fragment) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        if (gd_subtree_flag(fragment, 0)) { lxb_dom_node_destroy_deep(fragment); return GD_UNSUPPORTED; }
        if (operation == SET_HTML) gd_clear_children(node);
        while (fragment->first_child) {
            lxb_dom_node_t *child = fragment->first_child;
            lxb_dom_node_remove(child);
            lxb_dom_node_insert_child(node, child);
        }
        lxb_dom_node_destroy(fragment);
        return LXB_STATUS_OK;
    }
    return LXB_STATUS_ERROR_WRONG_ARGS;
}

int gk_execute(gd_document *doc, const uint32_t *words, size_t length, const unsigned char *payload, size_t bytes) {
    GD_PROFILE_SCOPE(GP_EXECUTE);
    if (!gd_begin(doc)) return 0;
    size_t cursor = 0, operation_index = 0;
    while (cursor < length) {
        if (length - cursor < 6) goto invalid;
        uint32_t op = words[cursor], count = words[cursor + 1];
        uint32_t ao = words[cursor + 2], al = words[cursor + 3], bo = words[cursor + 4], bl = words[cursor + 5];
        if (op < SET_ATTR || op > REMOVE_NODE || count > length - cursor - 6 || ao > bytes || al > bytes - ao || bo > bytes || bl > bytes - bo) goto invalid;
        const uint32_t *ids = words + cursor + 6;
        if (!gd_valid_ids(doc, ids, count)) goto failed;
        GD_PROFILE_ADD(GP_COMMANDS, 1); GD_PROFILE_ADD(GP_MUTATED_NODES, count);
        GD_PROFILE_SCOPE(op <= REMOVE_ATTR ? GP_MUTATE_ATTR : op == SET_TEXT ? GP_MUTATE_TEXT : op == REMOVE_NODE ? GP_MUTATE_REMOVE : GP_MUTATE_HTML);
        const lxb_char_t *a = al ? payload + ao : (const lxb_char_t *) "";
        const lxb_char_t *b = bl ? payload + bo : (const lxb_char_t *) "";
        for (size_t i = 0; i < count; i++) {
            lxb_status_t status = gd_mutate(doc, op, doc->nodes[ids[i]].node, a, al, b, bl);
            if (status != LXB_STATUS_OK) {
                if (status == GD_UNSUPPORTED) { gd_error(doc, "ERR_GROVEDOM_UNSUPPORTED", "Template contents are not supported by this prototype"); goto failed; }
                gd_mutation_error(doc, operation_index); goto failed;
            }
        }
        cursor += 6 + count;
        operation_index++;
    }
    gd_active = NULL;
    return 1;
invalid:
    gd_error(doc, "ERR_GROVEDOM_COMMAND", "Invalid command or payload bounds");
failed:
    gd_active = NULL;
    return 0;
}
const size_t *gk_stats(void) {
    static _Thread_local size_t values[4];
    values[0] = gd_live_documents; values[1] = gd_live_bytes;
    values[2] = gd_peak_bytes; values[3] = gd_allocations;
    return values;
}
