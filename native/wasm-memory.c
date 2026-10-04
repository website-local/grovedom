#include <stddef.h>

/* Wasm-only libc shadows. Most dynamically called copies are tiny; bounded
 * scalar loads/stores avoid a bulk-operation setup for those calls. Larger
 * operations use the engine's bulk-memory instructions, already required by
 * the linked libc. Inline builtins must not become recursive libc calls.
 * Head/tail accesses stay inside the requested range at every alignment. */
__attribute__((target("bulk-memory")))
void *memcpy(void *restrict dest, const void *restrict source, size_t size) {
    unsigned char *d = dest; const unsigned char *s = source;
    if (size > 16) return __builtin_memcpy(dest, source, size);
    if (size >= 8) { __builtin_memcpy_inline(d, s, 8); __builtin_memcpy_inline(d + size - 8, s + size - 8, 8); }
    else if (size >= 4) { __builtin_memcpy_inline(d, s, 4); __builtin_memcpy_inline(d + size - 4, s + size - 4, 4); }
    else if (size >= 2) { __builtin_memcpy_inline(d, s, 2); __builtin_memcpy_inline(d + size - 2, s + size - 2, 2); }
    else if (size) *d = *s;
    return dest;
}
__attribute__((target("bulk-memory")))
void *memmove(void *dest, const void *source, size_t size) { return __builtin_memmove(dest, source, size); }
__attribute__((target("bulk-memory")))
void *memset(void *dest, int value, size_t size) {
    unsigned char *d = dest;
    if (size > 16) return __builtin_memset(dest, value, size);
    if (size >= 8) { __builtin_memset_inline(d, value, 8); __builtin_memset_inline(d + size - 8, value, 8); }
    else if (size >= 4) { __builtin_memset_inline(d, value, 4); __builtin_memset_inline(d + size - 4, value, 4); }
    else if (size >= 2) { __builtin_memset_inline(d, value, 2); __builtin_memset_inline(d + size - 2, value, 2); }
    else if (size) *d = value;
    return dest;
}
