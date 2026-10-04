#ifndef GROVEDOM_MEMORY_H
#define GROVEDOM_MEMORY_H
#include "document.h"

extern _Thread_local gd_document *gd_active;
extern _Thread_local size_t gd_live_documents, gd_control_bytes;
void gd_free(void *pointer);
int gd_reserve(void **data, size_t *capacity, size_t needed, size_t item_size);
#ifdef GROVEDOM_FAULT_INJECTION
/* Diagnostic only: fail a GroveDOM buffer growth after N successful requests. */
void gd_test_fail_after(long requests);
#endif
#endif
