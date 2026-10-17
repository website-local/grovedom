#ifndef GROVEDOM_MUTATE_H
#define GROVEDOM_MUTATE_H
#include "kernel.h"

/* Operations are synchronous, ordered, and preserve effects preceding failure. */
/* Sort operation 13 optionally takes find contexts in other; it never exposes
 * additional nodes. With no contexts it keeps the ordinary tree-order union. */
const gd_result *gk_edit(gd_document *doc, uint32_t operation, const uint32_t *ids, size_t count, const uint32_t *other, size_t other_count);
int gk_execute(gd_document *doc, const uint32_t *words, size_t length, const unsigned char *payload, size_t bytes);
#endif
