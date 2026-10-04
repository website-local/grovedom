/* Deterministic failures in owned buffer growth, not upstream allocator fuzzing. */
#include "kernel.h"
#include "memory.h"
#include <assert.h>
#include <string.h>

static void input(gd_document *doc, const char *text) {
    void *buffer = gk_input(doc, strlen(text));
    assert(buffer != NULL);
    memcpy(buffer, text, strlen(text));
}

int main(void) {
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
    return 0;
}
