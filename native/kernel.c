#include "internal.h"

int gd_set_error(gd_document *doc, const char *code, const char *message) {
    doc->error_code = code;
    doc->error_message = message;
    return 0;
}
int gd_begin(gd_document *doc) {
    doc->error_code = doc->error_message = NULL;
    if (doc->closed) return gd_set_error(doc, "ERR_GROVEDOM_DISPOSED", "Document has been disposed");
    gd_active = doc;
    return 1;
}
const gd_result *gd_result_set(gd_document *doc, uint32_t kind, const void *data, size_t length, uint32_t number) {
    doc->result = (gd_result) { kind, data, length, number };
    gd_active = NULL;
    return &doc->result;
}
const gd_result *gd_failed(void) { gd_active = NULL; return NULL; }
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
    gd_free(doc->xml_name.data);
    gd_free(doc->selector_text.data);
    doc->html = NULL;
    doc->insertion_context = NULL;
    doc->css = NULL;
    doc->selectors = NULL;
    doc->selector_summary = NULL;
    doc->xml_names = NULL;
    doc->attribute_history = NULL;
    doc->nodes = NULL;
    doc->results = NULL;
    doc->input.data = doc->output.data = doc->transfer.data = doc->xml_name.data = doc->selector_text.data = NULL;
    gd_live_documents--;
}

void gk_dispose(gd_document *doc) { gd_release(doc); }
void gk_delete(gd_document *doc) { if (doc) { gd_release(doc); gd_control_bytes -= sizeof(*doc); free(doc); } }
void *gk_input(gd_document *doc, size_t length) {
    if (!gd_begin(doc)) return NULL;
    if (length >= UINT32_MAX || !gd_reserve((void **) &doc->input.data, &doc->input.capacity, length + 1, 1)) {
        gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Input allocation failed"); gd_active = NULL; return NULL;
    }
    doc->input.length = length;
    doc->input.data[length] = 0;
    gd_active = NULL;
    return doc->input.data;
}
void *gk_transfer(gd_document *doc, size_t length) {
    if (!gd_begin(doc)) return NULL;
    if (!gd_reserve((void **) &doc->transfer.data, &doc->transfer.capacity, length ? length : 1, 1)) {
        gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Transfer allocation failed"); gd_active = NULL; return NULL;
    }
    gd_active = NULL;
    return doc->transfer.data;
}

gd_document *gk_new(void) {
    GD_PROFILE_SCOPE(GP_CREATE);
    gd_document *doc = calloc(1, sizeof(*doc));
    if (!doc) return NULL;
    gd_control_bytes += sizeof(*doc);
    gd_live_documents++;
    gd_active = doc;
    doc->html = lxb_html_document_create();
    if (!doc->html) {
        gk_delete(doc); gd_active = NULL; return NULL;
    }
    gd_active = NULL;
    return doc;
}
static int gd_parse(gd_document *doc, int scripting, int fragment, int allow_templates) {
    GD_PROFILE_SCOPE(GP_PARSE);
    if (!gd_begin(doc)) return 0;
    if (doc->node_count) { gd_set_error(doc, "ERR_GROVEDOM_ARGUMENT", "Document already parsed"); goto failed; }
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
    if (!allow_templates && !gd_templates(doc, root)) goto failed;
    gd_free(doc->input.data);
    doc->input = (gd_buffer) {0};
    if (!gd_id(doc, root)) goto failed;
    gd_active = NULL;
    return 1;
failed:
    if (!doc->error_code) gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Document creation failed");
    gd_active = NULL;
    return 0;
}
int gk_parse_xml(gd_document *doc, unsigned flags) {
    GD_PROFILE_SCOPE(GP_PARSE);
    if (!gd_begin(doc)) return 0;
    if (doc->node_count) { gd_set_error(doc, "ERR_GROVEDOM_ARGUMENT", "Document already parsed"); gd_active = NULL; return 0; }
    doc->xml = 1; doc->xml_flags = flags;
    lxb_dom_document_t *dom = &doc->html->dom_document;
    dom->type = LXB_DOM_DOCUMENT_DTYPE_XML;
    /* XML uses DOM links/attributes, not HTML element lifecycle hooks. The
     * underlying DOM operations still maintain id/class and sibling links. */
    lxb_dom_document_opt_set(dom, lxb_dom_document_opt(dom) | LXB_DOM_DOCUMENT_OPT_WO_EVENTS);
    dom->clone_interface = gd_xml_clone_interface;
    dom->destroy_interface = lxb_dom_interface_destroy;
    lxb_dom_node_t *fragment = gd_xml_parse(doc, doc->input.data, doc->input.length);
    if (!fragment) goto failed;
    while (fragment->first_child) {
        lxb_dom_node_t *child = fragment->first_child;
        lxb_dom_node_remove(child); lxb_dom_node_insert_child(&dom->node, child);
    }
    lxb_dom_node_destroy(fragment);
    gd_free(doc->input.data); doc->input = (gd_buffer) {0};
    if (!gd_id(doc, &dom->node)) goto failed;
    gd_active = NULL; return 1;
failed:
    if (!doc->error_code) gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "XML document creation failed");
    gd_active = NULL; return 0;
}
int gk_parse(gd_document *doc, int scripting, int fragment) { return gd_parse(doc, scripting, fragment, 0); }
#ifdef GROVEDOM_PROFILE_GROWTH
/* Parsing-only diagnostic: include template allocations on unmodified pages.
 * This entry point is absent from production builds and exposes no DOM API. */
int gk_parse_profile(gd_document *doc) { return gd_parse(doc, 1, 0, 1); }
#endif
