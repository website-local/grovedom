#ifndef GROVEDOM_PROFILE_H
#define GROVEDOM_PROFILE_H
#include <stdint.h>

/* Diagnostic builds only. No counters, clocks, or branches in release code. */
enum {
    GP_CREATE, GP_PARSE, GP_DISPOSE, GP_QUERY, GP_PLAN,
    GP_READ_ATTR, GP_READ_TEXT, GP_READ_HTML, GP_READ_OTHER,
    GP_TRAVERSE, GP_EDIT, GP_EXECUTE, GP_MUTATE_ATTR, GP_MUTATE_TEXT,
    GP_MUTATE_HTML, GP_MUTATE_REMOVE, GP_BIND_INPUT, GP_BIND_OUTPUT,
    GP_BIND_CHECKS, GP_BIND_ACCOUNT, GP_PROBE, GP_ALLOC_CALLS, GP_ALLOC_BYTES,
    GP_OUTPUT_CHUNKS, GP_OUTPUT_BYTES, GP_COMMANDS, GP_MUTATED_NODES,
    GP_PLAN_HITS, GP_PLAN_MISSES, GP_GUARD_NODES, GP_GUARD_CANDIDATES,
    GP_GUARD_VALIDATIONS, GP_XML_NAME, GP_XML_DECODE, GP_XML_SERIALIZE,
    GP_XML_NAME_HITS, GP_XML_NAME_MISSES,
    GP_MALLOC, GP_CALLOC, GP_REALLOC, GP_FREE,
    GP_SELECTOR_ASCII_CALLS, GP_SELECTOR_ASCII_BYTES, GP_SELECTOR_ASCII_LOADS, GP_SELECTOR_UNICODE,
    GP_SELECTOR_EQUAL, GP_SELECTOR_PREFIX, GP_SELECTOR_SUFFIX,
    GP_SELECTOR_DASH, GP_SELECTOR_SUBSTRING, GP_SELECTOR_TOKEN, GP_COUNT
};
#ifdef GROVEDOM_PROFILE
typedef struct gp_scope {
    struct gp_scope *parent;
    uint64_t start, children;
    unsigned phase;
} gp_scope;
gp_scope gp_start(unsigned phase);
void gp_attach(gp_scope *scope);
void gp_end(gp_scope *scope);
void gp_add(unsigned phase, double units);
const double *gk_profile_snapshot(void);
const char *gk_profile_name(unsigned index);
unsigned gk_profile_count(void);
void gk_profile_reset(void);
void gk_profile_probe(unsigned count);
#define GD_PROFILE_SCOPE(phase) gp_scope gp_current_scope __attribute__((cleanup(gp_end))) = gp_start(phase); gp_attach(&gp_current_scope)
#define GD_PROFILE_ADD(phase, units) gp_add(phase, (double) (units))
#else
#define GD_PROFILE_SCOPE(phase) ((void) 0)
#define GD_PROFILE_ADD(phase, units) ((void) 0)
#endif
#endif
