#include "internal.h"

static lxb_dom_node_t *gd_fragment_boundary(lxb_dom_node_t *node) {
    while (node && node->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT) node = node->parent;
    return node;
}

static lxb_status_t gd_match_template(gd_document *doc, lxb_dom_node_t *node, lxb_dom_node_t *boundary, lxb_css_selector_list_t *plan) {
    /* Selector ancestry stops at the fragment, while raw parent identity stays
     * connected. No JS callback can run during this synchronous kernel call. */
    lxb_dom_node_t *parent = boundary ? boundary->parent : NULL;
    if (boundary) boundary->parent = NULL;
    lxb_status_t status;
    if (doc->selector_guard || doc->selector_custom) {
        int matched = doc->selector_guard ? gd_selector_guard_match(doc, node) : gd_selector_match(doc, node, plan);
        status = matched ? gd_collect(node, 0, doc) : doc->error_code ? LXB_STATUS_ERROR : LXB_STATUS_OK;
    } else status = lxb_selectors_match_node(doc->selectors, node, plan, gd_collect, doc);
    if (boundary) boundary->parent = parent;
    return status;
}

static lxb_status_t gd_find_compatibility(gd_document *doc, lxb_dom_node_t *root, lxb_css_selector_list_t *plan, int cross_fragments) {
    /* Cheerio queries start at element children. Only global/non-element
     * scopes cross fragments; element-only scopes stop at those boundaries. */
    for (lxb_dom_node_t *start = root->first_child; start; start = start->next) {
        if (start->type != LXB_DOM_NODE_TYPE_ELEMENT) continue;
        lxb_dom_node_t *node = start;
        lxb_dom_node_t *boundary = gd_fragment_boundary(start->parent);
        for (;;) {
            if (node->type == LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT) boundary = node;
            if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
                lxb_status_t status = gd_match_template(doc, node, boundary, plan);
                if (status != LXB_STATUS_OK) return status;
            }
            if (node->first_child && (cross_fragments || node->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT)) { node = node->first_child; continue; }
            while (node != start && !node->next) {
                if (node == boundary) boundary = gd_fragment_boundary(node->parent);
                node = node->parent;
            }
            if (node == start) break;
            if (node == boundary) boundary = gd_fragment_boundary(node->parent);
            node = node->next;
        }
    }
    return LXB_STATUS_OK;
}

static lxb_status_t gd_find_tag(gd_document *doc, lxb_dom_node_t *root, lxb_tag_id_t tag, int cross_fragments) {
    /* A single tag has no ancestor conditions. Keep the same scope and preorder
     * rules, without fragment-parent changes or a general matcher per node. */
    for (lxb_dom_node_t *start = root->first_child; start; start = start->next) {
        if (start->type != LXB_DOM_NODE_TYPE_ELEMENT) continue;
        lxb_dom_node_t *node = start;
        for (;;) {
            if (node->type == LXB_DOM_NODE_TYPE_ELEMENT) {
                GD_PROFILE_ADD(GP_GUARD_NODES, 1);
                if (node->local_name == tag) {
                    GD_PROFILE_ADD(GP_GUARD_CANDIDATES, 1);
                    lxb_status_t status = gd_collect(node, 0, doc);
                    if (status != LXB_STATUS_OK) return status;
                }
            }
            if (node->first_child && (cross_fragments || node->type != LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT)) { node = node->first_child; continue; }
            while (node != start && !node->next) node = node->parent;
            if (node == start) break;
            node = node->next;
        }
    }
    return LXB_STATUS_OK;
}

static lxb_status_t gd_mark_match(lxb_dom_node_t *node, lxb_css_selector_specificity_t specificity, void *context) {
    (void) specificity;
    gd_document *doc = context;
    uint32_t id = gd_id(doc, node);
    if (!id) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
    if (doc->nodes[id].mark != doc->mark) {
        doc->nodes[id].mark = doc->mark;
        doc->nodes[id].order = 1;
    }
    return LXB_STATUS_OK;
}

static lxb_status_t gd_find_fragment(gd_document *doc, lxb_dom_node_t *root, lxb_css_selector_list_t *plan, lxb_selectors_cb_f collect) {
    lxb_dom_node_t *boundary = gd_fragment_boundary(root);
    lxb_dom_node_t *parent = boundary ? boundary->parent : NULL;
    if (boundary) boundary->parent = NULL;
    lxb_status_t status = lxb_selectors_find(doc->selectors, root, plan, collect, doc);
    if (boundary) boundary->parent = parent;
    return status;
}

static lxb_status_t gd_find_templates(gd_document *doc, lxb_dom_node_t *root, lxb_css_selector_list_t *plan) {
    // Keep Lexbor's evaluator alive for each ordinary subtree. It skips fragment
    // subtrees; visit those separately, then emit marked matches in one preorder
    // walk. No sorting, temporary node arrays, or per-element evaluator restart.
    lxb_status_t status = gd_find_fragment(doc, root, plan, gd_mark_match);
    if (status != LXB_STATUS_OK) return status;
    for (lxb_dom_node_t *start = root->first_child; start; start = start->next) {
        if (start->type != LXB_DOM_NODE_TYPE_ELEMENT) continue;
        lxb_dom_node_t *node = start;
        for (;;) {
            if (node->type == LXB_DOM_NODE_TYPE_DOCUMENT_FRAGMENT) {
                status = gd_find_fragment(doc, node, plan, gd_mark_match);
                if (status != LXB_STATUS_OK) return status;
            }
            uint32_t id = (uint32_t) (uintptr_t) node->user;
            if (id && doc->nodes[id].mark == doc->mark && doc->nodes[id].order) {
                if (!gd_reserve((void **) &doc->results, &doc->result_capacity, doc->result_count + 1, sizeof(uint32_t))) return LXB_STATUS_ERROR_MEMORY_ALLOCATION;
                doc->results[doc->result_count++] = id;
                doc->nodes[id].order = 0;
            }
            if (node->first_child) { node = node->first_child; continue; }
            while (node != start && !node->next) node = node->parent;
            if (node == start) break;
            node = node->next;
        }
    }
    return LXB_STATUS_OK;
}

static void gd_plans_clean(gd_document *doc) {
    /* Plans never escape a synchronous query; selections hold only node IDs.
     * Reset the whole bounded cache so keys and ASTs can share one arena. */
    doc->plan_count = 0;
    doc->selector_guard = NULL;
    lxb_css_parser_erase(doc->css);
    lxb_css_selectors_clean(doc->css->selectors);
}

static lxb_css_selector_list_t *gd_plan_get(gd_document *doc) {
    GD_PROFILE_SCOPE(GP_PLAN);
    if (!doc->css) {
        lxb_css_parser_t *css = lxb_css_parser_create();
        lxb_selectors_t *selectors = lxb_selectors_create();
        if (!css || !selectors || lxb_css_parser_init(css, NULL) != LXB_STATUS_OK ||
            lxb_selectors_init(selectors) != LXB_STATUS_OK) {
            lxb_css_parser_destroy(css, true);
            lxb_selectors_destroy(selectors, true);
            goto memory_error;
        }
        lxb_selectors_opt_set(selectors, LXB_SELECTORS_OPT_MATCH_FIRST);
        doc->css = css; doc->selectors = selectors;
    }
    for (size_t i = 0; i < doc->plan_count; i++) {
        gd_plan *plan = &doc->plans[i];
        if (plan->length == doc->input.length &&
            memcmp(plan->key, doc->input.data, plan->length) == 0) { GD_PROFILE_ADD(GP_PLAN_HITS, 1); doc->selector_flags = plan->flags; doc->selector_guard = plan->guard; return plan->list; }
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
        gd_set_error(doc, "ERR_GROVEDOM_SELECTOR", "Invalid or unsupported CSS selector");
        return NULL;
    }
    if (doc->xml && !gd_xml_plan(doc, list)) {
        gd_plans_clean(doc);
        if (!doc->error_code) gd_set_error(doc, "ERR_GROVEDOM_SELECTOR", "Unsupported XML selector");
        return NULL;
    }
    char *key = lexbor_mraw_alloc(doc->css->memory->mraw, doc->input.length + 1);
    if (!key) { gd_plans_clean(doc); goto memory_error; }
    memcpy(key, doc->input.data, doc->input.length + 1);
    gd_plan *plan = &doc->plans[doc->plan_count++];
    doc->selector_flags = gd_selector_flags(list);
    doc->selector_guard = gd_selector_guard_create(doc, list);
    if (doc->error_code) { gd_plans_clean(doc); return NULL; }
    *plan = (gd_plan) { key, doc->input.length, list, doc->selector_flags, doc->selector_guard };
    return list;
memory_error:
    gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector allocation failed");
    return NULL;
}

const gd_result *gk_query(gd_document *doc, const uint32_t *ids, size_t count, int match) {
    GD_PROFILE_SCOPE(GP_QUERY);
    if (!gd_begin(doc)) return NULL;
    if (!gd_valid_ids(doc, ids, count)) return gd_failed();
    lxb_css_selector_list_t *plan = NULL;
    lxb_tag_id_t simple_tag = 0;
    int possible;
    if (gd_selector_plain_tag(doc->input.data, doc->input.length)) {
        if (doc->xml) {
            if (!gd_xml_tag_id(doc, doc->input.data, doc->input.length, &simple_tag)) return gd_failed();
        } else simple_tag = lxb_tag_id_by_name(doc->html->dom_document.tags, doc->input.data, doc->input.length);
        possible = simple_tag != 0;
    } else {
        plan = gd_plan_get(doc);
        if (!plan) return gd_failed();
        doc->selector_custom = (doc->selector_flags & GD_SELECTOR_CUSTOM) || (doc->templates && (doc->selector_flags & GD_SELECTOR_TEMPLATE));
        if (doc->selector_custom) doc->selector_guard = NULL;
        possible = gd_selector_guard_prepare(doc, !match && count == 1 && ids[0] == 1);
        if (doc->error_code) return gd_failed();
        simple_tag = gd_selector_simple_tag(doc);
    }
    gd_results_reset(doc);
    if (!possible) return gd_result_set(doc, GD_IDS, doc->results, 0, 0);
    int cross_fragments = 0;
    if (doc->templates && !match) for (size_t i = 0; i < count; i++) {
        if (doc->nodes[ids[i]].node->type != LXB_DOM_NODE_TYPE_ELEMENT) { cross_fragments = 1; break; }
    }
    for (size_t i = 0; i < count; i++) {
        lxb_dom_node_t *node = doc->nodes[ids[i]].node;
        if (match && node->type != LXB_DOM_NODE_TYPE_ELEMENT) continue;
        /* Cheerio does not infer selector quirks mode from a missing doctype.
         * Preserve the parser's mode for later fragment construction. */
        lxb_dom_document_cmode_t mode = doc->html->dom_document.compat_mode;
        doc->html->dom_document.compat_mode = LXB_DOM_DOCUMENT_CMODE_NO_QUIRKS;
        lxb_status_t status;
        if (simple_tag && match) {
            GD_PROFILE_ADD(GP_GUARD_NODES, 1);
            status = LXB_STATUS_OK;
            if (node->local_name == simple_tag) {
                GD_PROFILE_ADD(GP_GUARD_CANDIDATES, 1);
                status = gd_collect(node, 0, doc);
            }
        }
        else if (simple_tag) status = gd_find_tag(doc, node, simple_tag, cross_fragments);
        else if (match) status = (doc->templates || doc->selector_custom || doc->selector_guard) ? gd_match_template(doc, node, gd_fragment_boundary(node->parent), plan) : lxb_selectors_match_node(doc->selectors, node, plan, gd_collect, doc);
        else if (doc->selector_custom || doc->selector_guard) status = gd_find_compatibility(doc, node, plan, cross_fragments);
        else if (doc->templates) status = cross_fragments ? gd_find_templates(doc, node, plan) : gd_find_fragment(doc, node, plan, gd_collect);
        else status = lxb_selectors_find(doc->selectors, node, plan, gd_collect, doc);
        doc->html->dom_document.compat_mode = mode;
        if (status != LXB_STATUS_OK) { if (!doc->error_code) gd_set_error(doc, "ERR_GROVEDOM_SELECTOR", "Selector execution failed"); return gd_failed(); }
    }
    return gd_result_set(doc, GD_IDS, doc->results, doc->result_count, 0);
}
