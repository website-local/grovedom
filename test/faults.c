/* Deterministic failures in owned buffer growth, not upstream allocator fuzzing. */
#include "kernel.h"
#include "document.h"
#include "memory.h"
#include "xml.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>

static void input(gd_document *doc, const char *text) {
    void *buffer = gk_input(doc, strlen(text));
    assert(buffer != NULL);
    memcpy(buffer, text, strlen(text));
}

static void sweep_growth(int xml, int query) {
    /* Recreate the owner for every countdown: earlier failures must not warm
     * buffers and hide later allocation sites. More than 128 results crosses
     * both the node-ID and result-array growth boundaries. */
    char source[20000];
    strcpy(source, "<main>");
    for (int i = 0; i < 300; i++) strcat(source, "<p data-x='\xc3\x89'>text &amp; more</p>");
    strcat(source, "</main>");
    const uint32_t root = 1;
    for (long failure = 0; failure < 64; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(xml ? gk_parse_xml(doc, 0) : gk_parse(doc, 1, 0));
        if (query) input(doc, "p[data-x='\xc3\xa9' i]");
        gd_test_fail_after(failure);
        const gd_result *result = query ? gk_query(doc, &root, 1, 0) : gk_read(doc, READ_HTML, &root, 1);
        const int success = result != NULL;
        if (!success) {
            const char *code = gk_error_code(doc);
            assert(code && (!strcmp(code, "ERR_GROVEDOM_MEMORY") || !strcmp(code, "ERR_GROVEDOM_SELECTOR")));
        }
        gd_test_fail_after(-1);
        result = query ? gk_query(doc, &root, 1, 0) : gk_read(doc, READ_HTML, &root, 1);
        assert(result && (query ? result->length == 300 : result->length > 9000));
        /* A second live document catches allocator-scope/owner contamination. */
        gd_document *other = gk_new();
        assert(other);
        input(other, "<p>independent</p>");
        assert(gk_parse(other, 1, 0));
        gk_delete(other);
        gk_dispose(doc); gk_dispose(doc); gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure > 1); /* Verify this scenario exercised later sites. */
            fprintf(stderr, "Owned growth sweep xml=%d query=%d: %ld failure sites recovered\n", xml, query, failure);
            return;
        }
    }
    assert(0 && "Owned growth sweep did not reach success");
}

static void sweep_attribute_output(void) {
    char source[32768], expected[32768];
    strcpy(source, "<div title='");
    for (int i = 0; i < 500; i++) strcat(source, "plain&amp;&quot;&nbsp;&lt;&gt;");
    strcat(source, "' data-empty=''></div>");
    const uint32_t root = 1;
    gd_document *reference = gk_new();
    assert(reference);
    input(reference, source);
    assert(gk_parse(reference, 1, 0));
    const gd_result *serialized = gk_read(reference, READ_HTML, &root, 1);
    assert(serialized && serialized->length < sizeof(expected));
    size_t length = serialized->length;
    memcpy(expected, serialized->data, length);
    gk_delete(reference);
    for (long failure = 0; failure < 64; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(gk_parse(doc, 1, 0));
        gd_test_fail_after(failure);
        const gd_result *result = gk_read(doc, READ_HTML, &root, 1);
        int success = result != NULL;
        if (!success) assert(!strcmp(gk_error_code(doc), "ERR_GROVEDOM_MEMORY"));
        gd_test_fail_after(-1);
        result = gk_read(doc, READ_HTML, &root, 1);
        assert(result && result->length == length && !memcmp(result->data, expected, length));
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure > 0);
            fprintf(stderr, "HTML attribute output: %ld failure sites recovered\n", failure);
            return;
        }
    }
    assert(0 && "HTML attribute output sweep did not reach success");
}

static uint32_t selected_id(gd_document *doc, const char *selector) {
    const uint32_t root = 1;
    input(doc, selector);
    const gd_result *result = gk_query(doc, &root, 1, 0);
    assert(result && result->kind == GD_IDS && result->length == 1);
    return *(const uint32_t *) result->data;
}

static void query_mark_wrap(void) {
    for (int xml = 0; xml < 2; xml++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, "<main><section id='left'><b id='a'></b></section><section id='right'><b id='b'></b></section></main>");
        assert(xml ? gk_parse_xml(doc, 0) : gk_parse(doc, 1, 0));
        uint32_t main = selected_id(doc, "main"), left = selected_id(doc, "#left"), right = selected_id(doc, "#right");
        uint32_t a = selected_id(doc, "#a"), b = selected_id(doc, "#b");
        const uint32_t contexts[][3] = { {right, left, right}, {right, main, left}, {main, right, main} };
        const uint32_t starts[] = { UINT32_MAX - 3, UINT32_MAX - 2, UINT32_MAX - 1, UINT32_MAX, 0 };
        for (size_t i = 0; i < sizeof(starts) / sizeof(*starts); i++) {
            doc->mark = starts[i];
            for (size_t id = 1; id <= doc->node_count; id++) {
                doc->nodes[id].mark = starts[i];
                doc->nodes[id].order = UINT32_MAX;
            }
            for (size_t j = 0; j < sizeof(contexts) / sizeof(*contexts); j++) {
                const uint32_t unordered[] = {a, b, a};
                const gd_result *ordered = gk_edit(doc, 13, unordered, 3, contexts[j], 3);
                assert(ordered && ordered->kind == GD_IDS && ordered->length == 2);
                const uint32_t *sorted = ordered->data;
                assert(sorted[0] == (j ? a : b) && sorted[1] == (j ? b : a));
                for (int scoped = 0; scoped < 2; scoped++) {
                    input(doc, scoped ? "section b" : "b");
                    const gd_result *result = gk_query(doc, contexts[j], 3, 0);
                    assert(result && result->kind == GD_IDS && result->length == 2);
                    const uint32_t *ids = result->data;
                    assert(ids[0] == (j ? a : b) && ids[1] == (j ? b : a));
                }
            }
            const uint32_t contexts_with_matches[] = {right, main, left};
            const uint32_t unordered[] = {b, left, a, right};
            const uint32_t expected[] = {left, a, right, b};
            const gd_result *ordered = gk_edit(doc, 13, unordered, 4, contexts_with_matches, 3);
            assert(ordered && ordered->length == 4 && !memcmp(ordered->data, expected, sizeof(expected)));
            const uint32_t self_contexts[] = {right, left};
            const uint32_t self_expected[] = {left, right};
            ordered = gk_edit(doc, 13, self_contexts, 2, self_contexts, 2);
            assert(ordered && ordered->length == 2 && !memcmp(ordered->data, self_expected, sizeof(self_expected)));
        }
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
    }
}

static void sweep_query_order_growth(int kind) {
    char source[16000];
    strcpy(source, "<main><section id='left'>");
    for (int i = 0; i < 80; i++) strcat(source, "<b></b><aside><i></i></aside>");
    strcat(source, kind == 2 ? "</section><template><div><section id='right'>" : "</section><section id='right'>");
    for (int i = 0; i < 80; i++) strcat(source, "<b></b><aside><i></i></aside>");
    strcat(source, kind == 2 ? "</section></div></template></main>" : "</section></main>");
    for (long failure = 0; failure < 4; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(kind == 1 ? gk_parse_xml(doc, 0) : gk_parse(doc, 1, 0));
        uint32_t main = selected_id(doc, "main"), left = selected_id(doc, "#left"), right = selected_id(doc, "#right");
        const uint32_t contexts[] = {right, kind == 2 ? main : left, right};
        input(doc, "b");
        const gd_result *selected = gk_query(doc, contexts, 3, 0);
        assert(selected && selected->length == 160);
        uint32_t expected[160], unordered[161];
        memcpy(expected, selected->data, sizeof(expected));
        for (size_t i = 0; i < 160; i++) unordered[i] = expected[159 - i];
        unordered[160] = unordered[0];
        size_t exposed = doc->node_count;
        doc->mark = UINT32_MAX - 1;
        gd_test_fail_after(failure);
        const gd_result *result = gk_edit(doc, 13, unordered, 161, contexts, 3);
        int success = result != NULL;
        if (!success) assert(!strcmp(gk_error_code(doc), "ERR_GROVEDOM_MEMORY"));
        gd_test_fail_after(-1);
        result = gk_edit(doc, 13, unordered, 161, contexts, 3);
        assert(result && result->kind == GD_IDS && result->length == 160);
        assert(!memcmp(result->data, expected, sizeof(expected)));
        assert(doc->node_count == exposed); /* Dense walks must not register aside/i nodes. */
        input(doc, "b");
        result = gk_query(doc, contexts, 3, 0);
        assert(result && result->length == 160 && !memcmp(result->data, expected, sizeof(expected)));
        assert(doc->node_count == exposed);
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure == 1);
            fprintf(stderr, "Scoped ordering kind=%d: %ld failure site recovered\n", kind, failure);
            return;
        }
    }
    assert(0 && "Query ordering growth sweep did not reach success");
}

static void sweep_context_growth(int xml, int scoped) {
    char source[10000];
    strcpy(source, "<main>");
    for (int i = 0; i < 60; i++) strcat(source, "<section><b></b><b></b><b></b><b></b></section>");
    strcat(source, "</main>");
    for (long failure = 0; failure < 32; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(xml ? gk_parse_xml(doc, 0) : gk_parse(doc, 1, 0));
        const uint32_t root = 1;
        input(doc, "section");
        const gd_result *selected = gk_query(doc, &root, 1, 0);
        assert(selected && selected->length == 60);
        uint32_t contexts[61];
        for (size_t i = 0; i < 60; i++) contexts[i] = ((const uint32_t *) selected->data)[59 - i];
        contexts[60] = contexts[0];
        input(doc, scoped ? "section b" : "b");
        doc->mark = UINT32_MAX - 1;
        gd_test_fail_after(failure);
        const gd_result *result = gk_query(doc, contexts, 61, 0);
        int success = result != NULL;
        if (!success) {
            const char *code = gk_error_code(doc);
            assert(code && (!strcmp(code, "ERR_GROVEDOM_MEMORY") || !strcmp(code, "ERR_GROVEDOM_SELECTOR")));
        }
        gd_test_fail_after(-1);
        // Partial collection may have grown IDs/results and overwritten marks.
        // Retry also wraps the result generation and must preserve root order.
        result = gk_query(doc, contexts, 61, 0);
        assert(result && result->kind == GD_IDS && result->length == 240);
        const uint32_t *ids = result->data;
        for (size_t i = 0; i < result->length; i++) {
            assert(doc->nodes[ids[i]].node->parent == doc->nodes[contexts[i / 4]].node);
            if (i % 4) assert(doc->nodes[ids[i - 1]].node->next == doc->nodes[ids[i]].node);
        }
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure > 1);
            fprintf(stderr, "Context query growth xml=%d scoped=%d: %ld failure sites recovered\n", xml, scoped, failure);
            return;
        }
    }
    assert(0 && "Context query growth sweep did not reach success");
}

static void sweep_attribute_json(int xml) {
    char source[10000], expected[10000];
    const char *prefix = "<i data-x='", *suffix = "'></i>";
    size_t n = strlen(prefix);
    memcpy(source, prefix, n);
    memset(source + n, 'x', 4096); n += 4096;
    source[n++] = '"'; source[n++] = '\\';
    memset(source + n, 'y', 4096); n += 4096;
    strcpy(source + n, suffix);
    n = strlen("{\"data-x\":\"");
    memcpy(expected, "{\"data-x\":\"", n);
    memset(expected + n, 'x', 4096); n += 4096;
    memcpy(expected + n, "\\\"\\\\", 4); n += 4;
    memset(expected + n, 'y', 4096); n += 4096;
    memcpy(expected + n, "\"}", 2); n += 2;
    for (long failure = 0; failure < 16; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(xml ? gk_parse_xml(doc, 0) : gk_parse(doc, 1, 0));
        uint32_t id = selected_id(doc, "i");
        gd_test_fail_after(failure);
        const gd_result *result = gk_read(doc, READ_ATTRS, &id, 1);
        int success = result != NULL;
        if (!success) assert(strcmp(gk_error_code(doc), "ERR_GROVEDOM_MEMORY") == 0);
        gd_test_fail_after(-1);
        result = gk_read(doc, READ_ATTRS, &id, 1);
        assert(result && result->length == n && memcmp(result->data, expected, n) == 0);
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure > 1);
            fprintf(stderr, "Attribute JSON growth xml=%d: %ld failure sites recovered\n", xml, failure);
            return;
        }
    }
    assert(0 && "Attribute JSON growth sweep did not reach success");
}

static void sweep_template_context_growth(void) {
    char source[10000];
    strcpy(source, "<main><section id='outer'><template id='t'><div><section id='inner'>");
    for (int i = 0; i < 160; i++) strcat(source, "<b></b>");
    strcat(source, "</section></div></template><b id='outside'></b></section></main>");
    for (long failure = 0; failure < 32; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(gk_parse(doc, 1, 0));
        uint32_t outer = selected_id(doc, "#outer"), inner = selected_id(doc, "#inner");
        uint32_t template = selected_id(doc, "#t"), outside = selected_id(doc, "#outside");
        lxb_dom_node_t *fragment = doc->nodes[template].node->first_child;
        const uint32_t contexts[] = { outer, inner, outer };
        input(doc, "b");
        gd_test_fail_after(failure);
        const gd_result *result = gk_query(doc, contexts, 3, 0);
        int success = result != NULL;
        if (!success) {
            const char *code = gk_error_code(doc);
            assert(code && (!strcmp(code, "ERR_GROVEDOM_MEMORY") || !strcmp(code, "ERR_GROVEDOM_SELECTOR")));
        }
        gd_test_fail_after(-1);
        assert(fragment->parent == doc->nodes[template].node);
        result = gk_query(doc, contexts, 3, 0);
        assert(result && result->kind == GD_IDS && result->length == 161);
        const uint32_t *ids = result->data;
        for (size_t i = 0; i < 160; i++)
            assert(doc->nodes[ids[i]].node->parent == doc->nodes[inner].node);
        assert(ids[160] == outside);
        assert(fragment->parent == doc->nodes[template].node);
        input(doc, "section b");
        result = gk_query(doc, contexts, 3, 0);
        assert(result && result->length == 161);
        assert(fragment->parent == doc->nodes[template].node);
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure > 1);
            fprintf(stderr, "Template context query: %ld failure sites recovered\n", failure);
            return;
        }
    }
    assert(0 && "Template context query sweep did not reach success");
}

static void sweep_xml_markup(int xml, int raw) {
    char source[32768], expected[65536];
    size_t n = 0;
    source[n++] = '<';
    memset(source + n, 'n', 1024); n += 1024;
    source[n++] = ' ';
    memset(source + n, 'a', 1024); n += 1024;
    memcpy(source + n, "='", 2); n += 2;
    for (int i = 0; i < 300; i++) {
        const char span[] = "plain&amp;&quot;&lt;&gt;$\xc3\xa9";
        memcpy(source + n, span, sizeof(span) - 1); n += sizeof(span) - 1;
    }
    const char ending[] = "'><empty></empty></";
    memcpy(source + n, ending, sizeof(ending) - 1); n += sizeof(ending) - 1;
    memset(source + n, 'n', 1024); n += 1024;
    source[n++] = '>'; source[n] = 0;
    const uint32_t root = 1;
    const uint32_t operation = READ_XML_OPTIONS | ((raw ? XML_RAW | XML_PAIRED : 0) << 8);
    gd_document *reference = gk_new();
    assert(reference);
    input(reference, source);
    assert(xml ? gk_parse_xml(reference, XML_DECODE) : gk_parse(reference, 1, 0));
    const gd_result *result = gk_read(reference, operation, &root, 1);
    assert(result && result->length < sizeof(expected));
    size_t length = result->length;
    memcpy(expected, result->data, length);
    gk_delete(reference);
    for (long failure = 0; failure < 64; failure++) {
        gd_document *doc = gk_new();
        assert(doc);
        input(doc, source);
        assert(xml ? gk_parse_xml(doc, XML_DECODE) : gk_parse(doc, 1, 0));
        gd_test_fail_after(failure);
        result = gk_read(doc, operation, &root, 1);
        int success = result != NULL;
        if (!success) assert(!strcmp(gk_error_code(doc), "ERR_GROVEDOM_MEMORY"));
        gd_test_fail_after(-1);
        result = gk_read(doc, operation, &root, 1);
        assert(result && result->length == length && !memcmp(result->data, expected, length));
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
        if (success) {
            assert(failure > 1);
            fprintf(stderr, "XML markup growth xml=%d raw=%d: %ld failure sites recovered\n", xml, raw, failure);
            return;
        }
    }
    assert(0 && "XML markup growth sweep did not reach success");
}

int main(void) {
    query_mark_wrap();
    for (int kind = 0; kind < 3; kind++) sweep_query_order_growth(kind);
    for (int xml = 0; xml < 2; xml++) for (int scoped = 0; scoped < 2; scoped++) sweep_context_growth(xml, scoped);
    sweep_template_context_growth();
    for (int xml = 0; xml < 2; xml++) for (int raw = 0; raw < 2; raw++) sweep_xml_markup(xml, raw);
    sweep_attribute_json(0);
    sweep_attribute_json(1);
    for (int xml = 0; xml < 2; xml++) for (int query = 0; query < 2; query++) sweep_growth(xml, query);
    sweep_attribute_output();
    const uint32_t root = 1;
    for (int operation = 0; operation < 4; operation++) {
        gd_document *doc = gk_new();
        assert(doc != NULL);
        input(doc, "<main><p>one</p><p>two</p></main>");
        assert(gk_parse(doc, 1, 0));
        if (operation == 2) input(doc, "p");
        gd_test_fail_after(0);
        if (operation == 0) assert(gk_input(doc, 65536) == NULL);
        if (operation == 1) assert(gk_transfer(doc, 65536) == NULL);
        if (operation == 2) assert(gk_query(doc, &root, 1, 0) == NULL);
        if (operation == 3) assert(gk_read(doc, READ_HTML, &root, 1) == NULL);
        /* Query callback allocation errors currently use the selector category. */
        assert(strcmp(gk_error_code(doc), operation == 2
            ? "ERR_GROVEDOM_SELECTOR" : "ERR_GROVEDOM_MEMORY") == 0);
        gd_test_fail_after(-1);
        input(doc, "p");
        const gd_result *selected = gk_query(doc, &root, 1, 0);
        assert(selected && selected->kind == GD_IDS && selected->length == 2);
        const gd_result *html = gk_read(doc, READ_HTML, &root, 1);
        assert(html && html->kind == GD_STRING && html->length > 0);
        gk_dispose(doc);
        gk_dispose(doc);
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
    }
    // A failed Unicode comparison must report OOM, not an empty selection.
    for (int xml = 0; xml < 2; xml++) {
        gd_document *doc = gk_new();
        assert(doc != NULL);
        input(doc, "<main><p data-x='\xc3\x89'></p></main>");
        assert(xml ? gk_parse_xml(doc, 0) : gk_parse(doc, 1, 0));
        input(doc, "p");
        assert(gk_query(doc, &root, 1, 0));
        input(doc, xml ? "main:has(> [data-x='\xc3\xa9' i])" : "[data-x='\xc3\xa9' i]");
        gd_test_fail_after(0);
        assert(gk_query(doc, &root, 1, 0) == NULL);
        assert(strcmp(gk_error_code(doc), "ERR_GROVEDOM_MEMORY") == 0);
        gd_test_fail_after(-1);
        const gd_result *matched = gk_query(doc, &root, 1, 0);
        assert(matched && matched->length == 1);
        gk_delete(doc);
        const size_t *stats = gk_stats();
        assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
    }
    return 0;
}
