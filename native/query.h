#ifndef GROVEDOM_QUERY_H
#define GROVEDOM_QUERY_H
#include "kernel.h"

enum { GD_QUERY_FIND, GD_QUERY_FILTER, GD_QUERY_ANY };
/* Selector input is supplied through gk_input. ANY returns a numeric boolean;
 * FIND/FILTER return snapshot IDs. Bindings share this private contract. */
const gd_result *gk_query(gd_document *doc, const uint32_t *ids, size_t count, int match);
#endif
