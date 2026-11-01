import { alive, empty } from './common.js';
const classToken = /\S+/g;
const whitespaceRun = /\s+/;
export function createCollectionHelpers(context) {
    const { kernel, isSelection, NodeHandle, wrap, selection, inputIds, nodeIds, entry, edit, enqueue, flush, traverseUntil } = context;
    class MappedCollection extends Array {
        static get [Symbol.species]() { return Array; }
        get(index) { return index === undefined ? this.toArray() : this.at(Number(index)); }
        toArray() { return Array.from(this); }
        each(callback) { for (let i = 0; i < this.length; i++)
            if (callback.call(this[i], i, this[i]) === false)
                break; return this; }
        map(callback) { return mapped(this, callback); }
        eq(index) { const value = this.get(index); return this._next(value === undefined ? [] : [value]); }
        first() { return this.eq(0); }
        last() { return this.eq(-1); }
        slice(start, end) { return this._next(Array.prototype.slice.call(this, start, end)); }
        _next(values) { const result = Object.assign(new MappedCollection(), values); Object.defineProperty(result, 'previous', { value: this }); return result; }
        end() { return this.previous; }
    }
    function mapped(source, callback) {
        const result = new MappedCollection();
        let allNodes = true;
        source.each(function (i, value) {
            const next = callback.call(value, i, value);
            if (Array.isArray(next)) {
                for (const item of next) {
                    result.push(item);
                    if (allNodes && !(item instanceof NodeHandle)) allNodes = false;
                }
            }
            else if (next != null) {
                result.push(next);
                if (allNodes && !(next instanceof NodeHandle)) allNodes = false;
            }
        });
        const state = isSelection(source) ? source._state.state : undefined;
        if (state && allNodes)
            return selection(state, inputIds(state, result), source);
        Object.defineProperty(result, 'previous', { value: source });
        return result;
    }
    function until(source, axis, stop, selector) {
        const { state, ids } = entry(source);
        if (!ids.length) return selection(state, empty, source);
        const stopRecord = isSelection(stop) || stop instanceof NodeHandle ? stop._state : undefined;
        let resultIds = null;
        if (!stop || typeof stop === 'string' || (stopRecord?.state === state && state.owner !== null))
            resultIds = traverseUntil(state, ids, axis | (selector && ids.length > 1 ? 256 : 0),
                typeof stop === 'string' ? stop : '', stopRecord ? nodeIds(stopRecord) : empty);
        if (resultIds === null) resultIds = untilCallbacks(state, ids, axis, stop, selector);
        let value = selection(state, resultIds, source);
        if (selector) {
            // Filters observe every accepted visit before deduplication/sorting.
            value = value.filter(selector);
            const record = value._state;
            record.previous = source;
            if (ids.length > 1 && record.ids.length > 1) record.ids = Uint32Array.from(new Set(record.ids));
        }
        if (axis === 9 && ids.length > 1) {
            const record = value._state;
            record.ids = edit(state, 13, record.ids).reverse();
        }
        return value;
    }
    function untilCallbacks(state, ids, axis, stop, selector) {
        const result = [], seen = selector ? null : new Set();
        let matched = 0;
        const one = new Uint32Array(1);
        for (const id of ids) {
            one[0] = id;
            flush(state);
            let path = kernel.traverse(state.owner, one, axis), version = state.treeVersion;
            for (let i = 0; i < path.length;) {
                const next = path[i++], node = wrap(state, next);
                const stopped = typeof stop === 'function' ? stop.call(node, matched, node) : stop && state.api(node).is(stop);
                alive(state);
                if (stopped) break;
                matched++;
                if (!seen || !seen.has(node)) { result.push(node); seen?.add(node); }
                if (version !== state.treeVersion) {
                    // A stop callback can remove or move the current/next node.
                    // Resume from the current live relation, as Cheerio does.
                    one[0] = next;
                    flush(state);
                    path = kernel.traverse(state.owner, one, axis);
                    i = 0;
                    version = state.treeVersion;
                }
            }
        }
        return inputIds(state, result);
    }
    function classTokens(value, result) {
        if (typeof value === 'string') {
            const tokens = value.match(classToken);
            if (!result) return tokens ?? [];
            if (tokens) for (let i = 0, length = tokens.length; i < length; i++) result.push(tokens[i]);
        } else if (Array.isArray(value)) {
            result ??= [];
            for (let i = 0, length = value.length; i < length; i++) if (i in value) classTokens(value[i], result);
        }
        return result ?? [];
    }
    function classes(source, action, value, force, argc) {
        const { state } = source._state;
        // String inputs are immutable. Array getters and callbacks are still
        // evaluated separately for each node, in their original order.
        const fixed = typeof value === 'string' && value
            ? action === 'remove' ? classTokens(value) : value.split(whitespaceRun) : null;
        return source.each(function (i, node) {
            if (node.nodeType !== 1)
                return;
            const one = state.api(node), old = one.attr('class') ?? '';
            const next = typeof value === 'function' ? action === 'toggle' ? value.call(node, i, old, force) : value.call(node, i, old) : value;
            if (action === 'remove' && !argc) {
                one.attr('class', '');
                return;
            }
            if (action === 'toggle' && (next === undefined || typeof next === 'boolean')) {
                const data = node._state;
                if (old)
                    data.savedClass = old;
                one.attr('class', next === false || old ? '' : data.savedClass ?? '');
                return;
            }
            let requested = fixed;
            if (!requested) {
                if (Array.isArray(next)) {
                    requested = classTokens(next);
                    if (!requested.length) return;
                } else if (typeof next === 'string' && next)
                    requested = action === 'remove' ? classTokens(next) : next.split(whitespaceRun);
                else return;
            }
            if (action === 'add') {
                let updated = old ? ` ${old} ` : '';
                for (const token of requested)
                    if (!old || !updated.includes(` ${token} `)) updated += `${token} `;
                one.attr('class', updated.trim());
                return;
            }
            const tokens = classTokens(old);
            let changed = false;
            for (const token of requested) {
                if (action === 'remove') {
                    let kept = 0;
                    for (let i = 0, length = tokens.length; i < length; i++) {
                        if (tokens[i] === token) changed = true;
                        else tokens[kept++] = tokens[i];
                    }
                    tokens.length = kept;
                } else {
                    const index = tokens.indexOf(token);
                    if (index < 0 && force !== false) tokens.push(token);
                    else if (index >= 0 && force !== true) {
                        for (let i = index + 1, length = tokens.length; i < length; i++) tokens[i - 1] = tokens[i];
                        tokens.length--;
                    }
                }
            }
            if (action === 'toggle' || changed) one.attr('class', tokens.join(' '));
        });
    }
    function wrapping(source, wrapper, inside) {
        const { state, ids } = source._state;
        return source.each(function (i, node) {
            const value = typeof wrapper === 'function' ? wrapper.call(node, i, node) : wrapper;
            if (inside ? node.nodeType !== 1 && node.type !== 'root' : node.type === 'root')
                return;
            const one = state.api(node);
            let root = state.api(value).first();
            const rootNode = root.get(0);
            if (!rootNode || rootNode.nodeType !== 1 || rootNode === node)
                return;
            if (i + 1 < ids.length || (typeof value === 'string' && !value.trimStart().startsWith('<')))
                root = root.clone();
            let inner = root;
            for (;;) {
                const children = inner.children();
                if (!children.length) break;
                inner = children.first();
            }
            if (inside) {
                const contents = one.contents();
                inner.empty().append(contents);
                one.empty().append(root);
            }
            else {
                one.before(root);
                inner.empty().append(one);
            }
        });
    }
    function content(source, position, values, owned = true) {
        const { state, ids } = entry(source);
        if (!ids.length)
            return source;
        if (typeof values[0] === 'function')
            return source.each(function (i, node) {
                const type = node.nodeType;
                if (type !== 1 && (type !== 9 || position >= 2))
                    return;
                const one = state.api(node);
                content(one, position, [values[0].call(node, i, one.html())]);
            });
        // Rest/callback arrays belong to this helper. Caller-owned nested arrays
        // keep their forward snapshot before reversal, after the callback check.
        const reverse = position === 1 || position === 3;
        const ordered = reverse ? (owned ? values : [...values]).reverse() : values;
        for (const value of ordered) {
            if (value == null)
                continue;
            if (typeof value === 'string') {
                if (position === 0)
                    enqueue(state, ids, 5, value);
                else
                    edit(state, position + 7, ids, empty, value);
            }
            else {
                let nested = false;
                if (Array.isArray(value)) for (let i = 0, length = value.length; i < length; i++) if (i in value) {
                    const item = value[i];
                    if (typeof item === 'string' || Array.isArray(item)) { nested = true; break; }
                }
                if (nested) content(source, position, value, false);
                else edit(state, position + 3, ids, inputIds(state, value));
            }
        }
        return source;
    }
    return { mapped, until, classTokens, classes, wrapping, content };
}
