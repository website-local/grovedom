#ifndef GROVEDOM_QUERY_H
#define GROVEDOM_QUERY_H
#include "kernel.h"

/* Selector input is supplied through gk_input; returned IDs are a snapshot. */
const gd_result *gk_query(gd_document *doc, const uint32_t *ids, size_t count, int match);
#endif
