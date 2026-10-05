/* Deterministic failures in owned buffer growth, not upstream allocator fuzzing. */
#include "kernel.h"
#include "memory.h"
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

int main(void) {
    for (int xml = 0; xml < 2; xml++) for (int query = 0; query < 2; query++) sweep_growth(xml, query);
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
    gd_document *doc = gk_new();
    assert(doc != NULL);
    input(doc, "<p data-x=\xc3\x89></p>");
    assert(gk_parse(doc, 1, 0));
    input(doc, "p");
    assert(gk_query(doc, &root, 1, 0));
    input(doc, "[data-x='\xc3\xa9' i]");
    gd_test_fail_after(0);
    assert(gk_query(doc, &root, 1, 0) == NULL);
    assert(strcmp(gk_error_code(doc), "ERR_GROVEDOM_MEMORY") == 0);
    gd_test_fail_after(-1);
    const gd_result *matched = gk_query(doc, &root, 1, 0);
    assert(matched && matched->length == 1);
    gk_delete(doc);
    const size_t *stats = gk_stats();
    assert(stats[0] == 0 && stats[1] == 0 && stats[4] == 0);
    return 0;
}
