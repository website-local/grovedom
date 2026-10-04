#include "internal.h"


/* Track Lexbor backing allocations, not individual arena slots. The library is
 * statically linked with hidden symbols; these hooks affect only this kernel.
 * Each caller thread owns its documents, allocation scope, and counters. */
typedef union {
    max_align_t alignment;
    struct { size_t size; gd_document *owner; } value;
} gd_allocation;
_Thread_local gd_document *gd_active;
static _Thread_local size_t gd_live_bytes, gd_peak_bytes, gd_allocations;
_Thread_local size_t gd_live_documents, gd_control_bytes;

#ifdef __wasm__
/* Only synchronous transfers use this space. Pending operations and
 * returned results remain document-owned. Keep capacity paired with JS glue. */
static _Alignas(uint32_t) unsigned char gd_scratch[16384];
void *gk_scratch(void) { return gd_scratch; }
#endif

static void *gd_malloc(size_t size) {
    GD_PROFILE_ADD(GP_ALLOC_CALLS, 1); GD_PROFILE_ADD(GP_ALLOC_BYTES, size);
    if (!gd_active || size > SIZE_MAX - sizeof(gd_allocation)) return NULL;
    gd_allocation *allocation = malloc(sizeof(*allocation) + size);
    if (!allocation) return NULL;
    allocation->value.size = size + sizeof(*allocation);
    allocation->value.owner = gd_active;
    gd_active->bytes += allocation->value.size;
    gd_live_bytes += allocation->value.size;
    if (gd_live_bytes > gd_peak_bytes) gd_peak_bytes = gd_live_bytes;
    gd_allocations++;
    return allocation + 1;
}

void gd_free(void *pointer) {
    if (!pointer) return;
    gd_allocation *allocation = (gd_allocation *) pointer - 1;
    allocation->value.owner->bytes -= allocation->value.size;
    gd_live_bytes -= allocation->value.size;
    free(allocation);
}

static void *gd_calloc(size_t count, size_t size) {
    if (size && count > SIZE_MAX / size) return NULL;
    void *pointer = gd_malloc(count * size);
    if (pointer) memset(pointer, 0, count * size);
    return pointer;
}

static void *gd_realloc(void *pointer, size_t size) {
    if (!pointer) return gd_malloc(size);
    GD_PROFILE_ADD(GP_ALLOC_CALLS, 1); GD_PROFILE_ADD(GP_ALLOC_BYTES, size);
    if (!size) { gd_free(pointer); return NULL; }
    if (size > SIZE_MAX - sizeof(gd_allocation)) return NULL;
    gd_allocation *old = (gd_allocation *) pointer - 1;
    const size_t old_size = old->value.size;
    gd_document *owner = old->value.owner;
    gd_allocation *next = realloc(old, size + sizeof(*next));
    if (!next) return NULL;
    next->value.size = size + sizeof(*next);
    owner->bytes = owner->bytes - old_size + next->value.size;
    gd_live_bytes = gd_live_bytes - old_size + next->value.size;
    if (gd_live_bytes > gd_peak_bytes) gd_peak_bytes = gd_live_bytes;
    gd_allocations++;
    return next + 1;
}

/* The Linux loader runs this once before any environment can use the addon.
 * Lexbor's function pointers are process-wide: never rewrite them from the
 * per-environment Node-API initializer while another worker is allocating. */
#ifndef __wasm__
__attribute__((constructor))
#endif
void gk_init(void) {
    lexbor_memory_setup(gd_malloc, gd_realloc, gd_calloc, gd_free);
}

#ifdef GROVEDOM_FAULT_INJECTION
static _Thread_local long gd_fault_countdown = -1;
void gd_test_fail_after(long requests) { gd_fault_countdown = requests; }
#endif

int gd_reserve(void **data, size_t *capacity, size_t needed, size_t item_size) {
    if (needed <= *capacity) return 1;
#ifdef GROVEDOM_FAULT_INJECTION
    if (gd_fault_countdown == 0) return 0;
    if (gd_fault_countdown > 0) gd_fault_countdown--;
#endif
    size_t next = *capacity ? *capacity : 128;
    while (next < needed) {
        if (next > SIZE_MAX / 2) { next = needed; break; }
        next *= 2;
    }
    if (next > SIZE_MAX / item_size) return 0;
    void *memory = gd_realloc(*data, next * item_size);
    if (!memory) return 0;
    *data = memory;
    *capacity = next;
    return 1;
}


const size_t *gk_stats(void) {
    static _Thread_local size_t values[5];
    values[0] = gd_live_documents; values[1] = gd_live_bytes;
    values[2] = gd_peak_bytes; values[3] = gd_allocations;
    values[4] = gd_control_bytes;
    return values;
}
