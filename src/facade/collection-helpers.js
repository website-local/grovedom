import { empty } from './common.js';
export function createCollectionHelpers(context) {
    const { selections, nodes, selection, inputIds, entry, edit, enqueue } = context;
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
        source.each(function (i, value) {
            const next = callback.call(value, i, value);
            if (Array.isArray(next)) {
                for (const item of next)
                    result.push(item);
            }
            else if (next != null)
                result.push(next);
        });
        const state = selections.get(source)?.state;
        if (state && result.every(value => nodes.has(value)))
            return selection(state, inputIds(state, result), source);
        Object.defineProperty(result, 'previous', { value: source });
        return result;
    }
    function until(source, axis, stop, selector) {
        const { state, ids } = entry(source), result = [];
        for (const id of ids) {
            for (const node of selection(state, Uint32Array.of(id))._traverse(axis)) {
                if (stop && state.api(node).is(stop))
                    break;
                if (!result.includes(node))
                    result.push(node);
            }
        }
        let resultIds = inputIds(state, result);
        if (axis === 9 && ids.length > 1)
            resultIds = edit(state, 13, resultIds).reverse();
        const value = selection(state, resultIds, source);
        return selector ? value.filter(selector) : value;
    }
    const classTokens = value => typeof value === 'string' ? value.match(/\S+/g) ?? [] : Array.isArray(value) ? value.flatMap(classTokens) : [];
    function classes(source, action, value, force, argc) {
        const { state } = entry(source);
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
                const data = nodes.get(node);
                if (old)
                    data.savedClass = old;
                one.attr('class', next === false || old ? '' : data.savedClass ?? '');
                return;
            }
            const text = Array.isArray(next) ? classTokens(next).join(' ') : next;
            if (typeof text !== 'string' || !text)
                return;
            const requested = action === 'remove' ? classTokens(text) : text.split(/\s+/);
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
                const index = tokens.indexOf(token);
                if (action === 'remove') {
                    for (let i = tokens.length - 1; i >= 0; i--)
                        if (tokens[i] === token) { tokens.splice(i, 1); changed = true; }
                } else if (index < 0 && force !== false)
                    tokens.push(token);
                else if (index >= 0 && force !== true)
                    tokens.splice(index, 1);
            }
            if (action === 'toggle' || changed) one.attr('class', tokens.join(' '));
        });
    }
    function wrapping(source, wrapper, inside) {
        const { state, ids } = entry(source);
        return source.each(function (i, node) {
            const value = typeof wrapper === 'function' ? wrapper.call(node, i, node) : wrapper;
            if (inside ? node.nodeType !== 1 && node.type !== 'root' : node.type === 'root')
                return;
            const one = state.api(node);
            let root = state.api(value).first();
            if (!root.length || root[0].nodeType !== 1 || root[0] === node)
                return;
            if (i + 1 < ids.length || (typeof value === 'string' && !value.trimStart().startsWith('<')))
                root = root.clone();
            let inner = root;
            while (inner.children().length)
                inner = inner.children().first();
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
    function content(source, position, values) {
        const { state, ids } = entry(source);
        if (!ids.length)
            return source;
        if (values.length === 1 && typeof values[0] === 'function')
            return source.each(function (i, node) {
                if (node.nodeType !== 1)
                    return;
                const one = state.api(node);
                content(one, position, [values[0].call(node, i, one.html())]);
            });
        const ordered = position === 1 || position === 3 ? [...values].reverse() : values;
        for (const value of ordered) {
            if (value == null)
                continue;
            if (typeof value === 'string') {
                if (position === 0)
                    enqueue(state, ids, 5, value);
                else
                    edit(state, position + 7, ids, empty, value);
            }
            else if (Array.isArray(value) && value.some(item => typeof item === 'string' || Array.isArray(item)))
                content(source, position, value);
            else
                edit(state, position + 3, ids, inputIds(state, value));
        }
        return source;
    }
    return { mapped, until, classTokens, classes, wrapping, content };
}
