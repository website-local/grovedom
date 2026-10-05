#include "internal.h"

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
    gd_set_error(doc, "ERR_GROVEDOM_MUTATION", doc->error_buffer);
}
static lxb_dom_element_t *gd_insertion_context(gd_document *doc) {
    /* Cheerio's _makeDomArray parses insertion strings without a target,
     * using parse5's template context. Reuse this detached, arena-owned element
     * instead of allocating a temporary context for every insertion. */
    if (!doc->insertion_context)
        doc->insertion_context = lxb_dom_document_create_element(&doc->html->dom_document,
            (const lxb_char_t *) "template", 8, NULL);
    return doc->insertion_context;
}
static lxb_dom_node_t *gd_fragment(gd_document *doc, lxb_dom_node_t *context_node) {
    if (doc->xml) return gd_xml_parse(doc, doc->input.data, doc->input.length);
    /* Lexbor inserts head/body wrappers for an HTML-element fragment context.
     * Cheerio/parse5 keeps these mutation fragments as direct children. */
    int temporary = !context_node || context_node->type != LXB_DOM_NODE_TYPE_ELEMENT ||
        (context_node->ns == LXB_NS_HTML && context_node->local_name == LXB_TAG_HTML);
    lxb_dom_element_t *context = temporary ? gd_insertion_context(doc) : lxb_dom_interface_element(context_node);
    if (!context) return NULL;
    lxb_dom_node_t *fragment = lxb_html_document_parse_fragment(doc->html, context, doc->input.data, doc->input.length);
    if (fragment && !gd_templates(doc, fragment)) {
        gd_destroy_subtree(fragment);
        gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Template allocation failed");
        return NULL;
    }
    return fragment;
}

static lxb_dom_node_t *gd_clone(gd_document *doc, lxb_dom_node_t *source) {
    lxb_dom_node_t *root = lxb_dom_node_clone(source, true), *node = root;
    // Lexbor copies user fields. Clones must receive their own GroveDOM IDs.
    while (node) {
        uint32_t source_id = (uint32_t) (uintptr_t) node->user;
        node->user = NULL;
        if (doc->attribute_history && !gd_attributes_clone(doc, source_id, node)) return NULL;
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
        if (node == child) return gd_set_error(doc, "ERR_GROVEDOM_MUTATION", "Insertion would create a node cycle");
    }
    if (child->type == LXB_DOM_NODE_TYPE_DOCUMENT || (parent->type != LXB_DOM_NODE_TYPE_ELEMENT && parent->type != LXB_DOM_NODE_TYPE_DOCUMENT && parent->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT)) return gd_set_error(doc, "ERR_GROVEDOM_MUTATION", "Invalid insertion target");
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
    /* Moving previously detached nodes can introduce new names into the root. */
    if ((operation >= 3 && operation <= 10) || operation >= 14) doc->selector_summary_valid = 0;
    if (operation == 1) {
        lxb_dom_node_t *fragment = gd_fragment(doc, count ? doc->nodes[ids[0]].node : NULL);
        if (!fragment) goto failed;
        lxb_dom_node_t *root = lxb_dom_interface_node(lxb_dom_document_create_document_fragment(&doc->html->dom_document));
        if (!root) { gd_destroy_subtree(fragment); goto failed; }
        while (fragment->first_child) {
            lxb_dom_node_t *child = fragment->first_child;
            lxb_dom_node_remove(child);
            lxb_dom_node_insert_child(root, child);
            if (gd_collect(child, 0, doc) != LXB_STATUS_OK) { gd_destroy_subtree(fragment); goto failed; }
        }
        lxb_dom_node_destroy(fragment);
    } else if (operation == 2 || operation == 13) {
        /* A shared non-element parent makes cloned collections usable with
         * sibling traversal and wrapping, without inconsistent native links. */
        lxb_dom_node_t *container = operation == 2 && count ? lxb_dom_interface_node(lxb_dom_document_create_document_fragment(&doc->html->dom_document)) : NULL;
        if (operation == 2 && count && !container) goto failed;
        for (size_t i = 0; i < count; i++) {
            lxb_dom_node_t *node = operation == 2 ? gd_clone(doc, doc->nodes[ids[i]].node) : doc->nodes[ids[i]].node;
            if (!node) goto failed;
            if (container) lxb_dom_node_insert_child(container, node);
            if (gd_collect(node, 0, doc) != LXB_STATUS_OK) goto failed;
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
    } else if ((operation >= 3 && operation <= 10) || operation == 14 || operation == 15) {
        if (operation >= 14) for (size_t j = 0; j < other_count; j++) lxb_dom_node_remove(doc->nodes[other[j]].node);
        unsigned position = operation >= 14 ? operation - 12 : operation <= 7 ? (operation == 7 ? 2 : operation - 3) : operation - 7;
        for (size_t i = 0; i < count; i++) {
            lxb_dom_node_t *target = doc->nodes[ids[i]].node;
            if (position >= 2 && !target->parent) continue;
            lxb_dom_node_t *anchor = position == 1 ? target->first_child : target;
            if (operation <= 7 || operation >= 14) {
                for (size_t j = 0; j < other_count; j++) {
                    lxb_dom_node_t *child = doc->nodes[other[j]].node;
                    if (operation >= 14 || i + 1 < count) child = gd_clone(doc, child);
                    if (!child || !gd_insert(doc, target, child, position, &anchor, collect)) goto failed;
                }
                if (operation == 7) {
                    int keep = 0;
                    for (size_t j = 0; j < other_count; j++) if (doc->nodes[other[j]].node == target) { keep = 1; break; }
                    if (!keep) lxb_dom_node_remove(target);
                }
            } else {
                lxb_dom_node_t *fragment = gd_fragment(doc, NULL);
                if (!fragment) goto failed;
                while (fragment->first_child) {
                    lxb_dom_node_t *child = fragment->first_child;
                    if (!gd_insert(doc, target, child, position, &anchor, 0)) { gd_destroy_subtree(fragment); goto failed; }
                }
                lxb_dom_node_destroy(fragment);
            }
        }
    } else if (operation == 11 || operation == 12) {
        for (size_t i = 0; i < count; i++) {
            lxb_dom_node_t *node = doc->nodes[ids[i]].node;
            if (operation == 12) {
                if (node->type == LXB_DOM_NODE_TYPE_TEXT || node->type == LXB_DOM_NODE_TYPE_COMMENT || node->type == LXB_DOM_NODE_TYPE_PROCESSING_INSTRUCTION) {
                    lxb_dom_character_data_t *data = lxb_dom_interface_character_data(node);
                    if (lxb_dom_character_data_replace(data, doc->input.data, doc->input.length, 0, data->data.length) != LXB_STATUS_OK) goto failed;
                }
            } else if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
                int exact_name = doc->xml;
                if (node->ns != LXB_NS_HTML) for (size_t j = 0; j < doc->input.length; j++)
                    if (doc->input.data[j] >= 'A' && doc->input.data[j] <= 'Z') { exact_name = 1; break; }
                lxb_dom_element_t *element = exact_name ? gd_xml_element(doc, doc->input.data, doc->input.length, 0) : lxb_dom_document_create_element(&doc->html->dom_document, doc->input.data, doc->input.length, NULL);
                if (!element) goto failed;
                lxb_dom_node_t *replacement = lxb_dom_interface_node(element);
                replacement->ns = node->ns; replacement->prefix = node->prefix;
                if (gd_template(replacement)) doc->templates = 1;
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
    } else { gd_set_error(doc, "ERR_GROVEDOM_ARGUMENT", "Unknown edit operation"); return gd_failed(); }
    return gd_result_set(doc, operation == 1 || operation == 2 || operation == 13 || collect ? GD_IDS : GD_UNDEFINED, doc->results, doc->result_count, 0);
failed:
    if (!doc->error_code) gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Edit allocation failed");
    return gd_failed();
}

static lxb_status_t gd_mutate(gd_document *doc, uint32_t operation, lxb_dom_node_t *node,
                             const lxb_char_t *a, size_t alen, const lxb_char_t *b, size_t blen) {
    if (operation == REMOVE_NODE) { lxb_dom_node_remove(node); return LXB_STATUS_OK; }
    if (node->type != LXB_DOM_NODE_TYPE_ELEMENT && node->type != LXB_DOM_NODE_TYPE_DOCUMENT && node->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT) return LXB_STATUS_OK;
    if (operation == EMPTY_NODE) { gd_clear_children(node); return LXB_STATUS_OK; }
    if ((operation == SET_ATTR || operation == REMOVE_ATTR) && ((alen == 2 && lexbor_str_data_ncasecmp(a, (const lxb_char_t *) "id", 2)) ||
        (alen == 5 && lexbor_str_data_ncasecmp(a, (const lxb_char_t *) "class", 5)))) doc->selector_summary_valid = 0;
    if (operation == SET_HTML || operation == APPEND_HTML) doc->selector_summary_valid = 0;
    if (operation == SET_ATTR || operation == REMOVE_ATTR) {
        if (node->type != LXB_DOM_NODE_TYPE_ELEMENT) return LXB_STATUS_OK;
        if (!alen) return LXB_STATUS_ERROR_WRONG_ARGS;
        lxb_dom_attr_t *attr = gd_attribute(doc, node, a, alen);
        if (operation == REMOVE_ATTR) {
            return attr ? gd_attribute_remove(doc, node, attr) : LXB_STATUS_OK;
        }
        if (attr) {
            if (attr->value && attr->value->data && lexbor_str_size(attr->value) > blen) {
                memcpy(attr->value->data, b, blen); attr->value->data[blen] = 0; attr->value->length = blen;
                return LXB_STATUS_OK;
            }
            lexbor_str_t previous = attr->value ? *attr->value : (lexbor_str_t) {0};
            lxb_dom_document_t *dom = node->owner_document;
            int callback = !(lxb_dom_document_opt(dom) & LXB_DOM_DOCUMENT_OPT_WO_EVENTS)
                && dom->attr_mutation->change != NULL && attr->owner != NULL;
            lxb_status_t status = lxb_dom_attr_set_value(attr, b, blen);
            /* The pinned setter returns directly from its callback, bypassing
             * old-value cleanup. Keep HTML callbacks, then release that value.
             * Allocation failure must retain the previous owned buffer. */
            if (previous.data && attr->value && !attr->value->data) *attr->value = previous;
            else if (callback && previous.data) lexbor_mraw_free(dom->text, previous.data);
            return status;
        }
        attr = lxb_dom_attr_interface_create(&doc->html->dom_document);
        if (!attr) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        if ((doc->xml ? gd_xml_attr_name(doc, attr, a, alen, 0) : lxb_dom_attr_set_name(attr, a, alen, false)) != LXB_STATUS_OK || lxb_dom_attr_set_value(attr, b, blen) != LXB_STATUS_OK) { lxb_dom_attr_interface_destroy(attr); return LXB_STATUS_ERROR_MEMORY_ALLOCATION; }
        gd_attribute_restore(doc, node, attr);
        return lxb_dom_element_attr_append(lxb_dom_interface_element(node), attr);
    }
    if (operation == SET_TEXT) {
        lxb_dom_node_t *old = node->first_child;
        if (old && old == node->last_child && old->type == LXB_DOM_NODE_TYPE_TEXT && !old->user) {
            return lxb_dom_character_data_replace(lxb_dom_interface_character_data(old), a, alen, 0, 0);
        }
        /* Cheerio keeps a text child even for an empty string. Besides contents()
         * and retained identity, this distinguishes paired XML tags from <x/>. */
        lxb_dom_node_t *text = lxb_dom_interface_node(lxb_dom_document_create_text_node(&doc->html->dom_document, a, alen));
        if (!text) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        gd_clear_children(node);
        lxb_dom_node_insert_child(node, text);
        return LXB_STATUS_OK;
    }
    if (operation == SET_HTML || operation == APPEND_HTML) {
        if (!alen && (doc->xml || operation == APPEND_HTML || node->ns != LXB_NS_HTML || node->local_name != LXB_TAG_HTML)) {
            if (operation == SET_HTML) gd_clear_children(node);
            return LXB_STATUS_OK;
        }
        /* Detach old nodes instead of Lexbor's inner_html_set, which destroys
         * them and would invalidate selections that still refer to them. */
        lxb_dom_node_t *fragment;
        if (doc->xml) fragment = gd_xml_parse(doc, a, alen);
        else {
            int temporary = operation != APPEND_HTML && node->type != LXB_DOM_NODE_TYPE_ELEMENT;
            lxb_dom_element_t *context = operation == APPEND_HTML ? gd_insertion_context(doc) :
                temporary ? lxb_dom_document_create_element(&doc->html->dom_document, (const lxb_char_t *) "body", 4, NULL) : lxb_dom_interface_element(node);
            if (!context) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
            fragment = lxb_html_document_parse_fragment(doc->html, context, a, alen);
            if (temporary) lxb_dom_node_destroy(lxb_dom_interface_node(context));
        }
        if (!fragment) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        if (!doc->xml && !gd_templates(doc, fragment)) { gd_destroy_subtree(fragment); return LXB_STATUS_ERROR_MEMORY_ALLOCATION; }
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
        if (op < SET_ATTR || op > EMPTY_NODE || count > length - cursor - 6 || ao > bytes || al > bytes - ao || bo > bytes || bl > bytes - bo) goto invalid;
        const uint32_t *ids = words + cursor + 6;
        if (!gd_valid_ids(doc, ids, count)) goto failed;
        GD_PROFILE_ADD(GP_COMMANDS, 1); GD_PROFILE_ADD(GP_MUTATED_NODES, count);
        GD_PROFILE_SCOPE(op <= REMOVE_ATTR ? GP_MUTATE_ATTR : op == SET_TEXT ? GP_MUTATE_TEXT : op == REMOVE_NODE ? GP_MUTATE_REMOVE : GP_MUTATE_HTML);
        const lxb_char_t *a = al ? payload + ao : (const lxb_char_t *) "";
        const lxb_char_t *b = bl ? payload + bo : (const lxb_char_t *) "";
        for (size_t i = 0; i < count; i++) {
            lxb_status_t status = gd_mutate(doc, op, doc->nodes[ids[i]].node, a, al, b, bl);
            if (status != LXB_STATUS_OK) {
                gd_mutation_error(doc, operation_index); goto failed;
            }
        }
        cursor += 6 + count;
        operation_index++;
    }
    gd_active = NULL;
    return 1;
invalid:
    gd_set_error(doc, "ERR_GROVEDOM_COMMAND", "Invalid command or payload bounds");
failed:
    gd_active = NULL;
    return 0;
}
