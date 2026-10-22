#ifndef GROVEDOM_QUERY_H
#define GROVEDOM_QUERY_H
#include "kernel.h"

enum { GD_QUERY_FIND, GD_QUERY_FILTER, GD_QUERY_ANY };
/* Selector input is supplied through gk_input. ANY returns a numeric boolean;
 * FIND/FILTER return snapshot IDs. Bindings share this private contract. */
const gd_result *gk_query(gd_document *doc, const uint32_t *ids, size_t count, int match);
/* Walk next/previous siblings or parents up to a selector or supplied stop IDs.
 * Bit 256 preserves occurrences for the facade's later collection filter. */
const gd_result *gk_until(gd_document *doc, const uint32_t *ids, size_t count, uint32_t axis,
    const uint32_t *stops, size_t stop_count);
int gd_query_scoped(gd_document *doc, const uint32_t *ids, size_t count);
/* Order a marked subset of find results without assigning additional IDs.
 * The caller validates roots and supplies scratch for at least limit IDs. */
size_t gd_query_order(gd_document *doc, const uint32_t *ids, size_t count, uint32_t *output, size_t limit);
#endif
