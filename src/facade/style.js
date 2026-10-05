// Follow Cheerio's declaration splitting, including semicolons in values.
// This is a string utility, not a browser CSS parser or computed style model.
export function parseStyle(text) {
    const result = {};
    let previous;
    for (const rule of (text ?? '').trim().split(';')) {
        const colon = rule.indexOf(':');
        if (colon < 1 || colon === rule.length - 1) {
            const tail = rule.trimEnd();
            if (previous !== undefined && tail) result[previous] += `;${tail}`;
        } else {
            previous = rule.slice(0, colon).trim();
            Object.defineProperty(result, previous, {
                configurable: true, enumerable: true, writable: true,
                value: rule.slice(colon + 1).trim(),
            });
        }
    }
    return result;
}
