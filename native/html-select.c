#include "internal.h"
#include "html-select.h"
#include <lexbor/html/tree/insertion_mode.h>
#include <lexbor/html/tree/open_elements.h>
#include <lexbor/html/tag.h>

/* parse5 7's select insertion modes precede the customizable-select changes in
 * the pinned Lexbor. Only entering/resetting a select uses this compatibility
 * path; ordinary HTML and all XML keep their existing parser. */
static bool in_select(lxb_html_tree_t *, lxb_html_token_t *);
static bool in_select_table(lxb_html_tree_t *, lxb_html_token_t *);

void gd_html_select_enter(lxb_html_tree_t *tree) {
    lxb_html_tree_insertion_mode_f mode = tree->mode;
    tree->mode = mode == lxb_html_tree_insertion_mode_in_table || mode == lxb_html_tree_insertion_mode_in_caption ||
        mode == lxb_html_tree_insertion_mode_in_table_body || mode == lxb_html_tree_insertion_mode_in_row ||
        mode == lxb_html_tree_insertion_mode_in_cell ? in_select_table : in_select;
}
void gd_html_select_reset(lxb_html_tree_t *tree, size_t index) {
    tree->mode = in_select;
    while (index) {
        lxb_dom_node_t *n = tree->open_elements->list[--index];
        if (n->ns != LXB_NS_HTML) continue;
        if (n->local_name == LXB_TAG_TEMPLATE) return;
        if (n->local_name == LXB_TAG_TABLE) { tree->mode = in_select_table; return; }
    }
}
static bool current(lxb_html_tree_t *tree, lxb_tag_id_t tag) {
    return lxb_html_tree_node_is(lxb_html_tree_current_node(tree), tag);
}
static bool close_select(lxb_html_tree_t *tree) {
    // Select scope stops at any node other than HTML option/optgroup/select.
    for (size_t i = tree->open_elements->length; i;) {
        lxb_dom_node_t *n = tree->open_elements->list[--i];
        if (n->ns != LXB_NS_HTML) return false;
        if (n->local_name == LXB_TAG_SELECT) {
            tree->status = lxb_html_tree_open_elements_pop_until_node(tree, n, true);
            if (tree->status == LXB_STATUS_OK) lxb_html_tree_reset_insertion_mode_appropriately(tree);
            return true;
        }
        if (n->local_name != LXB_TAG_OPTION && n->local_name != LXB_TAG_OPTGROUP) return false;
    }
    return false;
}
static bool insert(lxb_html_tree_t *tree, lxb_html_token_t *token) {
    if (!lxb_html_tree_insert_html_element(tree, token)) {
        tree->status = LXB_STATUS_ERROR_MEMORY_ALLOCATION;
        return lxb_html_tree_process_abort(tree);
    }
    return true;
}
static bool in_select(lxb_html_tree_t *tree, lxb_html_token_t *token) {
    lxb_tag_id_t tag = token->tag_id;
    if (token->type & LXB_HTML_TOKEN_TYPE_CLOSE) {
        if (tag == LXB_TAG_TEMPLATE) return lxb_html_tree_insertion_mode_in_head(tree, token);
        if (tag == LXB_TAG_SELECT) {
            close_select(tree);
            return tree->status == LXB_STATUS_OK ? true : lxb_html_tree_process_abort(tree);
        }
        if (tag == LXB_TAG_OPTGROUP) {
            size_t n = tree->open_elements->length;
            if (current(tree, LXB_TAG_OPTION) && n > 1 && lxb_html_tree_node_is(tree->open_elements->list[n - 2], LXB_TAG_OPTGROUP))
                lxb_html_tree_open_elements_pop(tree);
        }
        if ((tag == LXB_TAG_OPTION || tag == LXB_TAG_OPTGROUP) && current(tree, tag)) lxb_html_tree_open_elements_pop(tree);
        return true;
    }
    switch (tag) {
        case LXB_TAG__TEXT: {
            lexbor_str_t str;
            lexbor_mraw_t *text = tree->document->dom_document.text;
            tree->status = token->null_count ? lxb_html_token_make_text_drop_null(token, &str, text) : lxb_html_token_make_text(token, &str, text);
            if (tree->status != LXB_STATUS_OK) return lxb_html_tree_process_abort(tree);
            if (!str.length) { lexbor_str_destroy(&str, text, false); return true; }
            tree->status = lxb_html_tree_insert_character_for_data(tree, &str, NULL);
            return tree->status == LXB_STATUS_OK ? true : lxb_html_tree_process_abort(tree);
        }
        case LXB_TAG__EM_COMMENT:
            if (lxb_html_tree_insert_comment(tree, token, NULL)) return true;
            tree->status = LXB_STATUS_ERROR_MEMORY_ALLOCATION;
            return lxb_html_tree_process_abort(tree);
        case LXB_TAG_HTML:
        case LXB_TAG__END_OF_FILE: return lxb_html_tree_insertion_mode_in_body(tree, token);
        case LXB_TAG_SCRIPT:
        case LXB_TAG_TEMPLATE: return lxb_html_tree_insertion_mode_in_head(tree, token);
        case LXB_TAG_OPTION:
        case LXB_TAG_OPTGROUP:
        case LXB_TAG_HR:
            if (current(tree, LXB_TAG_OPTION)) lxb_html_tree_open_elements_pop(tree);
            if (tag != LXB_TAG_OPTION && current(tree, LXB_TAG_OPTGROUP)) lxb_html_tree_open_elements_pop(tree);
            if (!insert(tree, token) || tree->status != LXB_STATUS_OK) return false;
            if (tag == LXB_TAG_HR) {
                lxb_html_tree_open_elements_pop(tree);
                lxb_html_tree_acknowledge_token_self_closing(tree, token);
            }
            return true;
        case LXB_TAG_SELECT:
        case LXB_TAG_INPUT:
        case LXB_TAG_KEYGEN:
        case LXB_TAG_TEXTAREA: {
            bool closed = close_select(tree);
            if (tree->status != LXB_STATUS_OK) return lxb_html_tree_process_abort(tree);
            return !closed || tag == LXB_TAG_SELECT; // Reprocess input outside select.
        }
        default: return true; // Ignore unknown elements, preserving their text.
    }
}
static bool in_select_table(lxb_html_tree_t *tree, lxb_html_token_t *token) {
    switch (token->tag_id) {
        case LXB_TAG_CAPTION: case LXB_TAG_TABLE: case LXB_TAG_TBODY: case LXB_TAG_TFOOT:
        case LXB_TAG_THEAD: case LXB_TAG_TR: case LXB_TAG_TD: case LXB_TAG_TH:
            if ((token->type & LXB_HTML_TOKEN_TYPE_CLOSE) &&
                !lxb_html_tree_element_in_scope(tree, token->tag_id, LXB_NS_HTML, LXB_HTML_TAG_CATEGORY_SCOPE_TABLE)) return true;
            if (!close_select(tree)) return true;
            if (tree->status != LXB_STATUS_OK) return lxb_html_tree_process_abort(tree);
            return false;
        default: return in_select(tree, token);
    }
}
