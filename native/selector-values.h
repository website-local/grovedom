#ifndef GROVEDOM_SELECTOR_VALUES_H
#define GROVEDOM_SELECTOR_VALUES_H
#include <lexbor/css/selectors/selector.h>
/* Byte width of one ECMAScript whitespace character, or zero. ASCII is the
 * common path; checking the remaining bytes never reads beyond the value. */
static inline size_t gd_selector_space(const lxb_char_t *p, const lxb_char_t *end) {
    unsigned c = *p;
    if (c < 128) return c == 32 || (c >= 9 && c <= 13);
    if (end - p >= 2 && c == 0xc2 && p[1] == 0xa0) return 2;
    if (end - p < 3) return 0;
    if (c == 0xe1 && p[1] == 0x9a && p[2] == 0x80) return 3;
    if (c == 0xe2 && ((p[1] == 0x80 && (p[2] <= 0x8a || p[2] == 0xa8 || p[2] == 0xa9 || p[2] == 0xaf)) || (p[1] == 0x81 && p[2] == 0x9f))) return 3;
    if (c == 0xe3 && p[1] == 0x80 && p[2] == 0x80) return 3;
    return c == 0xef && p[1] == 0xbb && p[2] == 0xbf ? 3 : 0;
}
bool gd_selector_value(const lexbor_str_t *target, const lexbor_str_t *value,
                       unsigned match, bool insensitive);
#endif
