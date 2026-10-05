#include "internal.h"
#include "selector-values.h"

typedef struct { uint32_t first, last; int32_t value; } gd_unicode_range;
#include "unicode-data.h"

static int32_t lookup(uint32_t cp, const gd_unicode_range *table, size_t count) {
    size_t low = 0;
    while (low < count) {
        size_t mid = low + (count - low) / 2;
        if (cp < table[mid].first) count = mid;
        else if (cp > table[mid].last) low = mid + 1;
        else return table[mid].value;
    }
    return 0;
}
#define LOOKUP(cp, name) lookup(cp, gd_##name, sizeof(gd_##name) / sizeof(*gd_##name))

static size_t decode(const lexbor_str_t *str, uint16_t *out) {
    size_t n = 0;
    for (size_t i = 0; i < str->length;) {
        uint32_t cp = str->data[i++];
        unsigned extra = cp < 128 ? 0 : cp < 0xe0 ? 1 : cp < 0xf0 ? 2 : 3;
        if (extra) {
            cp &= (1u << (6 - extra)) - 1;
            if (extra > str->length - i) { out[n++] = 0xfffd; break; }
            while (extra--) cp = (cp << 6) | (str->data[i++] & 63);
        }
        if (cp >= 0x10000) { cp -= 0x10000; out[n++] = 0xd800 + (cp >> 10); cp = 0xdc00 + (cp & 1023); }
        out[n++] = (uint16_t) cp;
    }
    return n;
}
static uint32_t codepoint(const uint16_t *s, size_t n, size_t *i) {
    uint32_t cp = s[(*i)++];
    if (cp >= 0xd800 && cp <= 0xdbff && *i < n && s[*i] >= 0xdc00 && s[*i] <= 0xdfff)
        cp = 0x10000 + ((cp - 0xd800) << 10) + s[(*i)++] - 0xdc00;
    return cp;
}
static size_t lowercase(const uint16_t *s, size_t n, uint16_t *out) {
    size_t used = 0;
    bool preceding_cased = false;
    for (size_t i = 0; i < n;) {
        uint32_t cp = codepoint(s, n, &i), original = cp;
        if (cp == 0x130) { out[used++] = 'i'; cp = 0x307; }
        else if (cp == 0x3a3) {
            bool following_cased = false;
            for (size_t j = i; j < n;) {
                uint32_t next = codepoint(s, n, &j);
                int flags = LOOKUP(next, properties);
                if (flags & 2) continue;
                following_cased = (flags & 1) != 0; break;
            }
            cp = preceding_cased && !following_cased ? 0x3c2 : 0x3c3;
        } else cp += LOOKUP(cp, lower);
        int flags = LOOKUP(original, properties);
        if (!(flags & 2)) preceding_cased = (flags & 1) != 0;
        if (cp >= 0x10000) { cp -= 0x10000; out[used++] = 0xd800 + (cp >> 10); cp = 0xdc00 + (cp & 1023); }
        out[used++] = (uint16_t) cp;
    }
    return used;
}
static bool unit_space(uint16_t c) {
    return c == 32 || (c >= 9 && c <= 13) || c == 0xa0 || c == 0x1680 ||
        (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 ||
        c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
}
static bool regex_equal(const uint16_t *a, const uint16_t *b, size_t n) {
    for (size_t i = 0; i < n; i++)
        if (a[i] != b[i] && a[i] + LOOKUP(a[i], canonical) != b[i] + LOOKUP(b[i], canonical)) return false;
    return true;
}
__attribute__((noinline)) static bool unicode_value(const lexbor_str_t *target, const lexbor_str_t *value, unsigned match) {
    gd_document *doc = gd_active;
    // UTF-8 byte lengths bound UTF-16 units. Keep originals and two potentially
    // expanded lowercase slices in one reusable document-owned allocation.
    if (target->length > SIZE_MAX - value->length || target->length + value->length > (SIZE_MAX - 1) / 6 ||
        !gd_reserve((void **) &doc->selector_text.data, &doc->selector_text.capacity,
                    (target->length + value->length) * 6 + 1, 1)) {
        gd_set_error(doc, "ERR_GROVEDOM_MEMORY", "Selector comparison allocation failed"); return false;
    }
    uint16_t *a = (uint16_t *) doc->selector_text.data, *b = a + target->length;
    size_t an = decode(target, a), bn = decode(value, b);
    if (match == LXB_CSS_SELECTOR_MATCH_SUBSTRING || match == LXB_CSS_SELECTOR_MATCH_INCLUDE) {
        bool token = match == LXB_CSS_SELECTOR_MATCH_INCLUDE;
        if ((!bn && !token) || an < bn) return false;
        if (token) for (size_t i = 0; i < bn; i++) if (unit_space(b[i])) return false;
        for (size_t i = 0; i <= an - bn; i++)
            if ((!token || ((!i || unit_space(a[i - 1])) && (i + bn == an || unit_space(a[i + bn])))) &&
                regex_equal(a + i, b, bn)) return true;
        return false;
    }
    uint16_t *al = b + value->length, *bl = al + 2 * target->length;
    size_t bln = lowercase(b, bn, bl), start = 0, length = an;
    switch (match) {
        case LXB_CSS_SELECTOR_MATCH_EQUAL: if (an != bln) return false; break;
        case LXB_CSS_SELECTOR_MATCH_PREFIX: if (!bn || an < bn) return false; length = bn; break;
        case LXB_CSS_SELECTOR_MATCH_SUFFIX: if (!bn) return false; start = an > bn ? an - bn : 0; length = an - start; break;
        case LXB_CSS_SELECTOR_MATCH_DASH: if (an != bn && (an <= bn || a[bn] != '-')) return false; length = bn; break;
        default: return false;
    }
    size_t aln = lowercase(a + start, length, al);
    return aln == bln && memcmp(al, bl, aln * sizeof(*al)) == 0;
}
static bool nonascii(const lexbor_str_t *s) {
    for (size_t i = 0; i < s->length; i++) if (s->data[i] >= 128) return true;
    return false;
}
static bool equal(const lxb_char_t *a, const lxb_char_t *b, size_t n, bool insensitive) {
    return insensitive ? lexbor_str_data_ncasecmp(a, b, n) : memcmp(a, b, n) == 0;
}
static bool token_value(const lexbor_str_t *target, const lexbor_str_t *value, bool insensitive) {
    const lxb_char_t *p = target->data, *end = p + target->length;
    if (target->length < value->length) return false;
    if (!value->length) {
        if (p == end) return true;
        bool previous = true;
        while (p < end) {
            size_t width = gd_selector_space(p, end);
            if (width && previous) return true;
            previous = width != 0;
            p += width ? width : 1;
        }
        return previous;
    }
    // Splitting the target already excludes operands containing whitespace.
    // Scan each byte once; the old two-loop form rescanned token boundaries.
    const lxb_char_t *start = p;
    while (p < end) {
        size_t width = gd_selector_space(p, end);
        if (!width) { p++; continue; }
        if ((size_t) (p - start) == value->length && equal(start, value->data, value->length, insensitive)) return true;
        p += width;
        start = p;
    }
    return (size_t) (p - start) == value->length && equal(start, value->data, value->length, insensitive);
}
/* Keep constant class/token operators in their callers; the Unicode helper
 * remains an out-of-line rare path. ThinLTO sees this across the Lexbor hook. */
__attribute__((always_inline)) bool gd_selector_value(const lexbor_str_t *target, const lexbor_str_t *value, unsigned match, bool insensitive) {
    if (insensitive && (nonascii(value) || nonascii(target))) return unicode_value(target, value, match);
    if (match == LXB_CSS_SELECTOR_MATCH_INCLUDE) return token_value(target, value, insensitive);
    size_t n = value->length, length = target->length;
    switch (match) {
        case LXB_CSS_SELECTOR_MATCH_EQUAL: return length == n && equal(target->data, value->data, n, insensitive);
        case LXB_CSS_SELECTOR_MATCH_DASH: return length >= n && (length == n || target->data[n] == '-') && equal(target->data, value->data, n, insensitive);
        case LXB_CSS_SELECTOR_MATCH_PREFIX: return n && length >= n && equal(target->data, value->data, n, insensitive);
        case LXB_CSS_SELECTOR_MATCH_SUFFIX: return n && length >= n && equal(target->data + length - n, value->data, n, insensitive);
        case LXB_CSS_SELECTOR_MATCH_SUBSTRING:
            return n && length >= n && (insensitive ? lexbor_str_data_ncasecmp_contain(target->data, length, value->data, n) : lexbor_str_data_ncmp_contain(target->data, length, value->data, n));
        default: return false;
    }
}
