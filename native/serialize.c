#include "internal.h"

typedef struct { gd_buffer *output; int value; } gd_attribute_output;

lxb_status_t gd_write(const lxb_char_t *data, size_t length, void *context) {
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
        if (node->first_child && !(inner_text && !doc->xml && node->type == LXB_DOM_NODE_TYPE_ELEMENT && (node->local_name == LXB_TAG_SCRIPT || node->local_name == LXB_TAG_STYLE))) { node = node->first_child; continue; }
        while (node != root && !node->next) node = node->parent;
        if (node == root) break;
        node = node->next;
    }
    return LXB_STATUS_OK;
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

static lxb_status_t gd_attribute_write(const lxb_char_t *data, size_t length, void *context) {
    gd_attribute_output *output = context;
    /* Lexbor emits escaping entities as separate chunks. HTML attributes
     * preserve angle brackets in Cheerio/parse5. Names and text keep their
     * original serialization; literal entity text still escapes its ampersand. */
    if (output->value) {
        if (length == 4 && memcmp(data, "&lt;", 4) == 0) return gd_write((const lxb_char_t *) "<", 1, output->output);
        if (length == 4 && memcmp(data, "&gt;", 4) == 0) return gd_write((const lxb_char_t *) ">", 1, output->output);
        if (length == 1 && data[0] == '"') output->value = 0;
    } else if (length >= 2 && data[length - 2] == '=' && data[length - 1] == '"') output->value = 1;
    return gd_write(data, length, output->output);
}

/* Reuse Lexbor's escaping and opening-tag serializer. Iterative traversal
 * bounds linear-stack use even for deeply nested templates; no temporary heap
 * allocation is needed per node. */
static lxb_status_t gd_serialize_tree(gd_document *doc, lxb_dom_node_t *root) {
    if (doc->xml) return gd_xml_serialize(doc, root, doc->xml_flags);
    lxb_dom_node_t *node = root;
    gd_attribute_output output = { &doc->output, 0 };
    while (node) {
        lxb_status_t status;
        if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) status = lxb_html_serialize_cb(node, gd_attribute_write, &output);
        else status = node->type == LXB_DOM_NODE_TYPE_DOCUMENT || node->type == LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT ? LXB_STATUS_OK : lxb_html_serialize_cb(node, gd_write, &doc->output);
        if (status != LXB_STATUS_OK) return status;
        lxb_dom_node_t *child = node->first_child;
        if (gd_template(node)) child = child ? child->first_child : NULL;
        if (!lxb_html_node_is_void(node) && child) { node = child; continue; }
        for (;;) {
            if (node->type == LXB_DOM_NODE_TYPE_ELEMENT && !lxb_html_node_is_void(node)) {
                size_t length;
                const lxb_char_t *name = lxb_dom_element_qualified_name(lxb_dom_interface_element(node), &length);
                if (!name || gd_write((const lxb_char_t *) "</", 2, &doc->output) != LXB_STATUS_OK ||
                    gd_write(name, length, &doc->output) != LXB_STATUS_OK ||
                    gd_write((const lxb_char_t *) ">", 1, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
            }
            if (node == root) return LXB_STATUS_OK;
            if (node->next) { node = node->next; break; }
            node = node->parent;
            if (node != root && node->parent && gd_template(node->parent)) node = node->parent;
        }
    }
    return LXB_STATUS_OK;
}

static lxb_status_t gd_serialize(gd_document *doc, lxb_dom_node_t *node, int inner) {
    if (!inner) return gd_serialize_tree(doc, node);
    for (node = node->first_child; node; node = node->next) {
        lxb_status_t status = gd_serialize_tree(doc, node);
        if (status != LXB_STATUS_OK) return status;
    }
    return LXB_STATUS_OK;
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
            lxb_dom_attr_t *attr = gd_attribute(doc, node, doc->input.data, doc->input.length);
            if (attr) { data = attr->value ? attr->value->data : (const lxb_char_t *) ""; length = attr->value ? attr->value->length : 0; }
        }
        if (!data) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
    } else if (operation == READ_NAME) {
        if (node && node->type == LXB_DOM_NODE_TYPE_ELEMENT) data = doc->xml || node->ns != LXB_NS_HTML ? lxb_dom_element_qualified_name(lxb_dom_interface_element(node), &length) : lxb_dom_element_local_name(lxb_dom_interface_element(node), &length);
        else if (node && node->type == LXB_DOM_NODE_TYPE_PROCESSING_INSTRUCTION) data = lxb_dom_processing_instruction_target(lxb_dom_interface_processing_instruction(node), &length);
        if (!data) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
    } else if (operation == READ_ATTRS) {
        if (!node || node->type != LXB_DOM_NODE_TYPE_ELEMENT) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
        status = gd_write((const lxb_char_t *) "{", 1, &doc->output);
        for (lxb_dom_attr_t *attr = lxb_dom_interface_element(node)->first_attr; attr && status == LXB_STATUS_OK; attr = attr->next) {
            size_t nlen;
            const lxb_char_t *name = gd_attribute_name(doc, attr, &nlen);
            if (attr != lxb_dom_interface_element(node)->first_attr) status = gd_write((const lxb_char_t *) ",", 1, &doc->output);
            if (status == LXB_STATUS_OK) status = gd_json(doc, name, nlen);
            if (status == LXB_STATUS_OK) status = gd_write((const lxb_char_t *) ":", 1, &doc->output);
            if (status == LXB_STATUS_OK) status = gd_json(doc, attr->value ? attr->value->data : NULL, attr->value ? attr->value->length : 0);
        }
        if (status == LXB_STATUS_OK) status = gd_write((const lxb_char_t *) "}", 1, &doc->output);
    } else if (operation == READ_DATA) {
        if (!node || (node->type != LXB_DOM_NODE_TYPE_TEXT && node->type != LXB_DOM_NODE_TYPE_COMMENT && node->type != LXB_DOM_NODE_TYPE_PROCESSING_INSTRUCTION)) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
        lexbor_str_t *str = &lxb_dom_interface_character_data(node)->data;
        data = str->data; length = str->length;
    } else if (operation == READ_TEXT || operation == READ_INNER_TEXT) {
        for (size_t i = 0; i < count && status == LXB_STATUS_OK; i++) status = gd_text(doc, doc->nodes[ids[i]].node, operation == READ_INNER_TEXT);
    } else if ((operation & 255) == READ_XML_OPTIONS && !(operation & ~(255u | ((XML_PAIRED | XML_RAW) << 8)))) {
        for (size_t i = 0; i < count && status == LXB_STATUS_OK; i++) status = gd_xml_serialize(doc, doc->nodes[ids[i]].node, operation >> 8);
    } else if (operation == READ_XML) {
        for (size_t i = 0; i < count && status == LXB_STATUS_OK; i++) status = gd_xml_serialize(doc, doc->nodes[ids[i]].node, doc->xml ? doc->xml_flags : XML_DECODE);
    } else if (operation == READ_ALL_OUTER) {
        for (size_t i = 0; i < count && status == LXB_STATUS_OK; i++) status = gd_serialize(doc, doc->nodes[ids[i]].node, 0);
    } else if (operation == READ_HTML || operation == READ_OUTER) {
        if (!node || (operation == READ_HTML && node->type != LXB_DOM_NODE_TYPE_ELEMENT && node->type != LXB_DOM_NODE_TYPE_DOCUMENT && node->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT)) return gd_result_set(doc, GD_NULL, NULL, 0, 0);
        status = gd_serialize(doc, node, operation == READ_HTML);
    } else { gd_set_error(doc, "ERR_GROVEDOM_ARGUMENT", "Unknown read operation"); return gd_failed(); }
    if (status != LXB_STATUS_OK) { gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Output allocation failed"); return gd_failed(); }
    if (!data) { data = doc->output.data; length = doc->output.length; }
    return gd_result_set(doc, GD_STRING, data, length, 0);
}
#ifdef __wasm__
const gd_result *gk_observe(gd_document *doc, const uint32_t *words, size_t length, const unsigned char *payload, size_t bytes,
    uint32_t operation, const uint32_t *ids, size_t count, const unsigned char *name, size_t name_length) {
    if (!gk_execute(doc, words, length, payload, bytes)) return NULL;
    /* Fragment mutations can replace input storage. Install the read operand
     * afterwards; the caller's transfer storage remains separate and live. */
    if (operation == READ_ATTR) {
        void *input = gk_input(doc, name_length);
        if (!input) return NULL;
        if (name_length) memcpy(input, name, name_length);
    }
    return gk_read(doc, operation, ids, count);
}
#endif
