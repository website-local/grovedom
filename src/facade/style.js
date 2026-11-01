// Follow Cheerio's declaration splitting, including semicolons in values.
// This is a string utility, not a browser CSS parser or computed style model.
export function parseStyle(text) {
    const result = {};
    const property = { configurable: true, enumerable: true, writable: true, value: '' };
    text = (text ?? '').trim();
    const length = text.length;
    let previous, start = 0, colon = text.indexOf(':');
    while (start <= length) {
        let end = text.indexOf(';', start);
        if (end < 0) end = length;
        if (colon <= start || colon >= end - 1) {
            const tail = text.slice(start, end).trimEnd();
            if (previous !== undefined && tail) result[previous] += `;${tail}`;
        } else {
            previous = text.slice(start, colon).trim();
            property.value = text.slice(colon + 1, end).trim();
            Object.defineProperty(result, previous, property);
        }
        start = end + 1;
        // Retain a later colon across malformed rules, including no-colon tails,
        // so each delimiter search advances instead of rescanning the suffix.
        if (colon >= 0 && colon < start) colon = text.indexOf(':', start);
    }
    return result;
}
