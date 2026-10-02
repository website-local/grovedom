/* Diagnostic build only: time libc's actual linear-memory growth. */
#include <stdint.h>
#include <stddef.h>

__attribute__((import_module("env"), import_name("growth_now")))
extern double growth_now(void);
__attribute__((import_module("env"), import_name("growth_sample")))
extern void growth_sample(unsigned pages, double elapsed);
extern void *__real_sbrk(intptr_t increment);

void *__wrap_sbrk(intptr_t increment) {
    size_t before = __builtin_wasm_memory_size(0);
    double start = growth_now();
    void *result = __real_sbrk(increment);
    size_t after = __builtin_wasm_memory_size(0);
    if (after > before) growth_sample((unsigned) (after - before), growth_now() - start);
    return result;
}
