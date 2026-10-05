import { createEncoder } from '../encoding.js';
import { expandSelector } from '../selectors.js';
import { alive, unsupported, empty, boolAttributes } from './common.js';
// One set of closures per facade; no per-document dispatch object.
export function createOperations(kernel) {
    const encoder = createEncoder();
    function commandViews(state, length, bytes) {
        // Repeated scalar callbacks usually submit the same command/value lengths.
        // Keep one view per buffer, refreshing after growth or a changed used range.
        if (!state.usedWords || state.usedWords.buffer !== state.words.buffer || state.usedWords.length !== length)
            state.usedWords = state.words.subarray(0, length);
        if (!state.usedPayload || state.usedPayload.buffer !== state.payload.buffer || state.usedPayload.length !== bytes)
            state.usedPayload = state.payload.subarray(0, bytes);
    }
    function flush(state) {
        alive(state);
        if (!state.wordLength)
            return;
        const length = state.wordLength, bytes = state.byteLength;
        // A failure discards unexecuted commands. Never retry already applied writes.
        state.wordLength = state.byteLength = 0;
        commandViews(state, length, bytes);
        kernel.execute(state.owner, state.usedWords, state.usedPayload);
    }
    function grow(buffer, required) {
        if (required > 0xffffffff)
            throw new RangeError('Command buffer exceeds the prototype limit');
        if (required <= buffer.length)
            return buffer;
        let size = Math.max(256, buffer.length);
        while (size < required)
            size = Math.min(size * 2, 0xffffffff);
        const next = new buffer.constructor(size);
        next.set(buffer);
        return next;
    }
    function encode(value, payload, offset) {
        // Names and short attribute values usually fit this path. Avoid allocating a
        // view and TextEncoder result object for every small ASCII operand.
        if (value.length <= 64) {
            let i = 0;
            for (; i < value.length; i++) {
                const code = value.charCodeAt(i);
                if (code > 0x7f)
                    break;
                payload[offset + i] = code;
            }
            if (i === value.length)
                return i;
        }
        return encoder.encodeInto(value, payload.subarray(offset)).written;
    }
    function enqueue(state, ids, op, a = '', b = '') {
        alive(state);
        if (!ids.length)
            return;
        // Bound retained batching storage. One large command can exceed this threshold.
        if (state.wordLength + ids.length + 6 > 16384 || state.byteLength + 3 * (a.length + b.length) > 65536)
            flush(state);
        state.words = grow(state.words, state.wordLength + 6 + ids.length);
        state.payload = grow(state.payload, state.byteLength + 3 * (a.length + b.length));
        const ao = state.byteLength;
        const al = encode(a, state.payload, ao);
        const bo = ao + al;
        const bl = encode(b, state.payload, bo);
        const offset = state.wordLength, words = state.words;
        words[offset] = op;
        words[offset + 1] = ids.length;
        words[offset + 2] = ao;
        words[offset + 3] = al;
        words[offset + 4] = bo;
        words[offset + 5] = bl;
        words.set(ids, offset + 6);
        state.wordLength += 6 + ids.length;
        state.byteLength = bo + bl;
        if (state.direct)
            flush(state);
    }
    function read(state, ids, operation, name = '') {
        alive(state);
        const nodes = ids.length === 1 ? ids[0] : ids;
        if (state.wordLength) {
            const length = state.wordLength, bytes = state.byteLength;
            state.wordLength = state.byteLength = 0;
            commandViews(state, length, bytes);
            return kernel.observe(state.owner, operation, nodes, name, state.usedWords, state.usedPayload);
        }
        return kernel.read(state.owner, operation, nodes, name);
    }
    function query(state, selector, roots, match = false) {
        if (typeof selector !== 'string')
            unsupported('Only string CSS selectors are supported here.');
        flush(state);
        // Keep ordinary CSS on the direct kernel path. These common Cheerio suffixes
        // apply to the matched selection, rather than to sibling position in the DOM.
        if (selector.includes(':')) {
            const suffix = /:(first|last|even|odd)$|:(eq|nth|lt|gt)\((-?\d+)\)$/.exec(selector);
            if (suffix) {
                const ids = query(state, selector.slice(0, suffix.index) || '*', roots, match);
                const kind = suffix[1] ?? suffix[2];
                let index = Number(suffix[3]);
                if (index < 0)
                    index += ids.length;
                if (kind === 'first')
                    return ids.slice(0, 1);
                if (kind === 'last')
                    return ids.slice(-1);
                if (kind === 'eq' || kind === 'nth')
                    return index >= 0 && index < ids.length ? ids.slice(index, index + 1) : empty;
                return ids.filter((_, i) => kind === 'even' ? i % 2 === 0 : kind === 'odd' ? i % 2 === 1 : kind === 'lt' ? i < index : i > index);
            }
            let expanded = state.selectorAliases?.get(selector);
            if (expanded === undefined) {
                expanded = expandSelector(selector);
                state.selectorAliases ??= new Map();
                if (state.selectorAliases.size === 32)
                    state.selectorAliases.clear();
                state.selectorAliases.set(selector, expanded);
            }
            selector = expanded;
        }
        const first = selector.charCodeAt(0);
        if (first === 62 || first === 43 || first === 126 || selector.startsWith(':scope') || first <= 32) {
            const relative = relativeQuery(state, selector.trimStart(), roots, match);
            if (relative !== null)
                return relative;
        }
        return kernel.query(state.owner, selector, roots, match);
    }
    function matches(state, selector, ids) {
        // The common tag-only is() path needs one boolean, not snapshot IDs.
        // Positional selectors, aliases and relative selectors keep query semantics.
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(selector))
            return query(state, selector, ids, true).length > 0;
        flush(state);
        return Boolean(kernel.matches(state.owner, selector, ids.length === 1 ? ids[0] : ids));
    }
    // Scan only the relative-selector path. Brackets, arguments, quotes and CSS
    // escapes keep embedded combinators from becoming traversal boundaries.
    function selectorBoundary(selector, separators) {
        let depth = 0, quote = '';
        for (let i = 0; i < selector.length; i++) {
            const char = selector[i];
            if (char === '\\') {
                i++;
                continue;
            }
            if (quote) {
                if (char === quote)
                    quote = '';
                continue;
            }
            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }
            if (char === '(' || char === '[')
                depth++;
            else if (char === ')' || char === ']')
                depth--;
            else if (!depth && separators.includes(char))
                return i;
        }
        return selector.length;
    }
    function relativeQuery(state, selector, roots, match) {
        if (!/^(?:[>+~]|:scope\b)/.test(selector))
            return null;
        if (match)
            unsupported('Relative selectors in filter/is are not supported.');
        roots = kernel.query(state.owner, '*', roots, true);
        const comma = selectorBoundary(selector, ',');
        if (comma < selector.length) {
            if (selector[0] !== '+' && selector[0] !== '~' && /^[+~]/.test(selector.slice(comma + 1).trimStart()))
                unsupported('Mixed child/sibling relative selector lists are not supported.');
            const left = query(state, selector.slice(0, comma), roots), right = query(state, selector.slice(comma + 1).trimStart(), roots);
            const both = new Uint32Array(left.length + right.length);
            both.set(left);
            both.set(right, left.length);
            return edit(state, 13, both);
        }
        let candidates, rest;
        if (selector.startsWith(':scope')) {
            candidates = roots;
            rest = selector.slice(6);
            const end = selectorBoundary(rest, ' >+~\t\r\n\f');
            if (end) {
                candidates = query(state, rest.slice(0, end), candidates, true);
                rest = rest.slice(end);
            }
        }
        else {
            const axis = selector[0] === '>' ? 1 : selector[0] === '+' ? 4 : 6;
            candidates = kernel.traverse(state.owner, roots, axis);
            rest = selector.slice(1).trimStart();
            const end = selectorBoundary(rest, ' >+~\t\r\n\f');
            candidates = query(state, rest.slice(0, end) || '*', candidates, true);
            rest = rest.slice(end);
        }
        rest = rest.trimStart();
        return rest ? query(state, rest, candidates) : candidates;
    }
    function edit(state, operation, ids = empty, other = empty, text = '') {
        flush(state);
        return kernel.edit(state.owner, operation, ids, other, text);
    }
    function attributes(state, ids) { const value = read(state, ids, 7); return value === undefined ? undefined : JSON.parse(value); }
    function attributeValue(state, ids, name) {
        const result = read(state, ids, 1, name);
        if (result === undefined && name === 'value' && ids.length) {
            const tag = read(state, ids, 5);
            if (tag === 'option')
                return read(state, ids.subarray(0, 1), 2);
            if (tag === 'input' && ['checkbox', 'radio'].includes(read(state, ids, 1, 'type')))
                return 'on';
        }
        return !state.xml && result !== undefined && boolAttributes.has(name.toLowerCase()) ? name.toLowerCase() : result;
    }
    return { flush, enqueue, read, query, matches, edit, attributes, attributeValue };
}
