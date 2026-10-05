#include "profile.h"
#include <string.h>
#ifdef __wasm__
__attribute__((import_module("env"), import_name("profile_now")))
extern double profile_now(void);
static uint64_t gp_now(void) { return (uint64_t) profile_now(); }
#else
#include <time.h>
static uint64_t gp_nanoseconds(void) {
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC_RAW, &value);
    return (uint64_t) value.tv_sec * UINT64_C(1000000000) + (uint64_t) value.tv_nsec;
}
#if defined(__x86_64__)
#define GP_TSC 1
#include <x86intrin.h>
static uint64_t gp_now(void) {
    _mm_lfence();
    uint64_t value = __rdtsc();
    _mm_lfence();
    return value;
}
static _Thread_local double ticks_per_ns;
static void gp_calibrate(void) {
    uint64_t start_ns = gp_nanoseconds(), start_ticks = gp_now(), end_ns;
    do { end_ns = gp_nanoseconds(); } while (end_ns - start_ns < 2000000);
    ticks_per_ns = (double) (gp_now() - start_ticks) / (double) (end_ns - start_ns);
}
#else
static uint64_t gp_now(void) { return gp_nanoseconds(); }
#endif
#endif
/* Columns: calls, inclusive ns, exclusive ns, reference TSC ticks, units.
 * TSC ticks are elapsed reference-clock ticks, not retired core cycles.
 * Native x86 scopes use only fenced TSC reads; conversion happens at snapshot
 * time, avoiding two expensive OS clock reads in every tiny operation. */
static _Thread_local double records[GP_COUNT][5], snapshot[GP_COUNT][5];
static _Thread_local gp_scope *current;
static const char *names[GP_COUNT] = {
    "create", "parse", "dispose", "query", "selectorPlan",
    "readAttribute", "readText", "readHTML", "readOther", "traverse", "edit",
    "execute", "mutateAttribute", "mutateText", "mutateHTML", "mutateRemove",
    "bindingInput", "bindingOutput", "bindingChecks", "bindingAccount", "probe",
    "allocationCalls", "allocationBytes", "outputChunks", "outputBytes",
    "commands", "mutatedNodes", "selectorHits", "selectorMisses",
    "guardNodes", "guardCandidates", "guardValidations",
    "xmlName", "xmlDecode", "xmlSerialize", "xmlNameHits", "xmlNameMisses",
    "malloc", "calloc", "realloc", "free"
};

gp_scope gp_start(unsigned phase) {
    gp_scope result = { current, gp_now(), 0, phase };
    return result;
}
void gp_attach(gp_scope *scope) { current = scope; }
void gp_end(gp_scope *scope) {
    uint64_t elapsed = gp_now() - scope->start;
    double *row = records[scope->phase];
    row[0]++; row[1] += elapsed; row[2] += elapsed - scope->children;
#ifdef GP_TSC
    row[3] += elapsed;
#endif
    current = scope->parent;
    if (current) current->children += elapsed;
}
void gp_add(unsigned phase, double units) { records[phase][4] += units; }
const double *gk_profile_snapshot(void) {
    memcpy(snapshot, records, sizeof(records));
#ifdef GP_TSC
    if (!ticks_per_ns) gp_calibrate();
    for (unsigned i = 0; i < GP_COUNT; i++) { snapshot[i][1] /= ticks_per_ns; snapshot[i][2] /= ticks_per_ns; }
#endif
    return &snapshot[0][0];
}
const char *gk_profile_name(unsigned index) { return index < GP_COUNT ? names[index] : ""; }
unsigned gk_profile_count(void) { return GP_COUNT; }
void gk_profile_reset(void) {
#ifdef GP_TSC
    if (!ticks_per_ns) gp_calibrate();
#endif
    memset(records, 0, sizeof(records));
}
void gk_profile_probe(unsigned count) { for (unsigned i = 0; i < count; i++) { GD_PROFILE_SCOPE(GP_PROBE); } }
