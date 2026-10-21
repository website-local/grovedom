#include "internal.h"

#ifndef __wasm__
typedef struct { gd_buffer *output; int value; } gd_attribute_output;
#endif

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
        int descend = !inner_text || node->type == LXB_DOM_NODE_TYPE_CDATA_SECTION ||
            (node->type == LXB_DOM_NODE_TYPE_ELEMENT && (doc->xml || (node->local_name != LXB_TAG_SCRIPT && node->local_name != LXB_TAG_STYLE)));
        if (node->first_child && descend) { node = node->first_child; continue; }
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

static lxb_status_t gd_doctype_data(gd_document *doc, lxb_dom_document_type_t *type) {
    size_t length;
    const lxb_char_t *name = lxb_dom_document_type_name(type, &length);
    if (gd_write((const lxb_char_t *) "!DOCTYPE ", 9, &doc->output) != LXB_STATUS_OK ||
        gd_write(name, length, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    const lexbor_str_t *values[] = { &type->public_id, &type->system_id };
    for (size_t i = 0; i < 2; i++) {
        const lexbor_str_t *value = values[i];
        if (!value->length) continue;
        const char *prefix = !i ? " PUBLIC " : type->public_id.length ? " " : " SYSTEM ";
        lxb_char_t quote = memchr(value->data, '"', value->length) ? '\'' : '"';
        if (gd_write((const lxb_char_t *) prefix, strlen(prefix), &doc->output) != LXB_STATUS_OK ||
            gd_write(&quote, 1, &doc->output) != LXB_STATUS_OK ||
            gd_write(value->data, value->length, &doc->output) != LXB_STATUS_OK ||
            gd_write(&quote, 1, &doc->output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    }
    return LXB_STATUS_OK;
}

#ifdef __wasm__
static lxb_status_t gd_html_attribute(gd_buffer *output, const char *prefix, size_t prefix_length,
    const lxb_char_t *name, size_t name_length, const lexbor_str_t *value) {
    const lxb_char_t *data = value ? value->data : NULL;
    size_t length = value ? value->length : 0, first = 0;
    /* HTML attribute values escape only ampersands, quotes and NBSP. Copy the
     * name, punctuation and first plain span together; most values end here. */
    while (first < length) {
        unsigned char c = data[first];
        if (c == '&' || c == '"' || (c == 0xc2 && first + 1 < length && data[first + 1] == 0xa0)) break;
        first++;
    }
    if (name_length > SIZE_MAX - prefix_length - 4 ||
        first > SIZE_MAX - prefix_length - name_length - 4) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    size_t size = prefix_length + name_length + first + 4;
    if (size > SIZE_MAX - output->length ||
        !gd_reserve((void **) &output->data, &output->capacity, output->length + size, 1)) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    lxb_char_t *target = output->data + output->length;
    *target++ = ' ';
    if (prefix_length) { memcpy(target, prefix, prefix_length); target += prefix_length; }
    if (name_length) { memcpy(target, name, name_length); target += name_length; }
    *target++ = '='; *target++ = '"';
    if (first) { memcpy(target, data, first); target += first; }
    if (first == length) *target = '"';
    else size--;
    output->length += size;
    GD_PROFILE_ADD(GP_OUTPUT_CHUNKS, 1); GD_PROFILE_ADD(GP_OUTPUT_BYTES, size);
    if (first == length) return LXB_STATUS_OK;

    size_t start = first;
    for (size_t i = first; i < length; i++) {
        const char *entity;
        size_t bytes, consumed = 1;
        if (data[i] == '&') { entity = "&amp;"; bytes = 5; }
        else if (data[i] == '"') { entity = "&quot;"; bytes = 6; }
        else if (data[i] == 0xc2 && i + 1 < length && data[i + 1] == 0xa0) {
            entity = "&nbsp;"; bytes = 6; consumed = 2;
        } else continue;
        if ((i > start && gd_write(data + start, i - start, output) != LXB_STATUS_OK) ||
            gd_write((const lxb_char_t *) entity, bytes, output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        i += consumed - 1;
        start = i + 1;
    }
    if (start < length && gd_write(data + start, length - start, output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    return gd_write((const lxb_char_t *) "\"", 1, output);
}

static lxb_status_t gd_html_element(gd_buffer *output, lxb_dom_element_t *element) {
    size_t length;
    const lxb_char_t *name = lxb_dom_element_qualified_name(element, &length);
    if (!name) return LXB_STATUS_ERROR;
    if (gd_write((const lxb_char_t *) "<", 1, output) != LXB_STATUS_OK ||
        gd_write(name, length, output) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    if (element->is_value && element->is_value->data &&
        !lxb_dom_element_attr_is_exist(element, (const lxb_char_t *) "is", 2) &&
        gd_html_attribute(output, NULL, 0, (const lxb_char_t *) "is", 2, element->is_value) != LXB_STATUS_OK) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    for (lxb_dom_attr_t *attr = element->first_attr; attr; attr = attr->next) {
        const char *prefix = NULL;
        size_t prefix_length = 0;
        /* HTML serialization uses namespace metadata even though the public
         * Cheerio-shaped attribute view exposes adjusted foreign local names. */
        if (attr->node.ns == LXB_NS__UNDEF || attr->node.ns == LXB_NS_XML ||
            attr->node.ns == LXB_NS_XMLNS || attr->node.ns == LXB_NS_XLINK) {
            name = lxb_dom_attr_local_name(attr, &length);
            if (!name) return LXB_STATUS_ERROR;
            if (attr->node.ns == LXB_NS_XML) { prefix = "xml:"; prefix_length = 4; }
            else if (attr->node.ns == LXB_NS_XLINK) { prefix = "xlink:"; prefix_length = 6; }
            else if (attr->node.ns == LXB_NS_XMLNS && !(length == 5 && memcmp(name, "xmlns", 5) == 0)) {
                prefix = "xmlns:"; prefix_length = 6;
            }
        } else {
            name = lxb_dom_attr_qualified_name(attr, &length);
            if (!name) return LXB_STATUS_ERROR;
        }
        lxb_status_t status = gd_html_attribute(output, prefix, prefix_length, name, length, attr->value);
        if (status != LXB_STATUS_OK) return status;
    }
    return gd_write((const lxb_char_t *) ">", 1, output);
}
#else
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
#endif

/* Reuse Lexbor's non-element serializer. Iterative traversal
 * bounds linear-stack use even for deeply nested templates; no temporary heap
 * allocation is needed per node. */
static lxb_status_t gd_serialize_tree(gd_document *doc, lxb_dom_node_t *root) {
    if (doc->xml) return gd_xml_serialize(doc, root, doc->xml_flags);
    lxb_dom_node_t *node = root;
#ifndef __wasm__
    gd_attribute_output output = { &doc->output, 0 };
#endif
    while (node) {
        lxb_status_t status;
#ifdef __wasm__
        if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) status = gd_html_element(&doc->output, lxb_dom_interface_element(node));
#else
        if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) status = lxb_html_serialize_cb(node, gd_attribute_write, &output);
#endif
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
        else if (node && node->type == LXB_DOM_NODE_TYPE_DOCUMENT_TYPE) { data = (const lxb_char_t *) "!doctype"; length = 8; }
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
        if (node && node->type == LXB_DOM_NODE_TYPE_DOCUMENT_TYPE) status = gd_doctype_data(doc, lxb_dom_interface_document_type(node));
        else {
            if (!node || (node->type != LXB_DOM_NODE_TYPE_TEXT && node->type != LXB_DOM_NODE_TYPE_COMMENT && node->type != LXB_DOM_NODE_TYPE_PROCESSING_INSTRUCTION)) return gd_result_set(doc, GD_UNDEFINED, NULL, 0, 0);
            lexbor_str_t *str = &lxb_dom_interface_character_data(node)->data;
            data = str->data; length = str->length;
        }
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
    } else if (operation == READ_FIRST_CHILD || operation == READ_LAST_CHILD) {
        lxb_dom_node_t *child = node ? operation == READ_FIRST_CHILD ? node->first_child : node->last_child : NULL;
        uint32_t id = child ? gd_id(doc, child) : 0;
        if (child && !id) { gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Child handle allocation failed"); return gd_failed(); }
        return gd_result_set(doc, GD_NUMBER, NULL, 0, id);
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
