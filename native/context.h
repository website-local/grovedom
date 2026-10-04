#ifndef GROVEDOM_CONTEXT_H
#define GROVEDOM_CONTEXT_H
#include "document.h"

int gd_set_error(gd_document *doc, const char *code, const char *message);
int gd_begin(gd_document *doc);
const gd_result *gd_result_set(gd_document *doc, uint32_t kind, const void *data, size_t length, uint32_t number);
const gd_result *gd_failed(void);
#endif
