import { alive, unsupported, empty, boolAttributes } from './common.js';
import { parseStyle } from './style.js';
const readOnlyProperties = new Set(['type', 'nodeType', 'children', 'childNodes', 'parent', 'parentNode',
    'next', 'prev', 'nextSibling', 'previousSibling', 'firstChild', 'lastChild']);
const rawProperties = new Set(['name', 'data', 'attribs', ...readOnlyProperties]);
// Methods keep private branding and selection snapshots. Helpers are bound once.
export function createSelection(context) {
    const { kernel, entry, wrap, selection, inputIds, nodeIds, query, matches, flush, edit, nodes, attributes, attributeValue, enqueue, read, attributeCallback, textCallback, mapped, until, classes, content, wrapping, data, removeData } = context;
    function setProperty(source, name, value) {
        const { state, ids } = entry(source);
        if (name === 'namespace')
            unsupported('Changing node namespaces is not supported.');
        if (readOnlyProperties.has(name))
            unsupported('Direct changes to node types or relations are not supported; use DOM mutation methods.');
        if (name === 'attribs')
            return source.each(function () {
                const record = nodes.get(this), one = nodeIds(record);
                // Reassigning the element's own live view is a no-op. Clearing
                // it first would also erase the replacement's source values.
                if (value && value === record.attribs) return;
                // Stored names can contain Unicode whitespace. removeAttr takes
                // a whitespace-delimited list; replacement deletes exact keys.
                for (const key of Object.keys(attributes(state, one) ?? {}))
                    enqueue(state, one, 2, key);
                if (value) state.api(this).attr(value);
            });
        if (name === 'tagName' || name === 'nodeName' || name === 'name') {
            edit(state, 11, ids, empty, String(value));
            return source;
        }
        if (name === 'innerHTML') return source.html(value);
        if (name === 'textContent' || name === 'innerText') return source.text(value);
        if (name === 'data')
            return source.each(function () {
                if (this.nodeType !== 1) return;
                const id = nodes.get(this).id;
                // Cheerio uses an attribute until a raw data property exists.
                // Replacements keep object identity, including explicit resets.
                if (state.data.has(id)) state.data.set(id, value);
                else state.api(this).attr(name, String(value));
            });
        // Ordinary properties use string values, including null/undefined from
        // callbacks. Boolean properties retain presence semantics.
        return source.attr(name, !state.xml && boolAttributes.has(name.toLowerCase()) ? value ? '' : null
            : value == null || typeof value === 'function' ? String(value) : value);
    }
    function setStyle(state, node, name, value, index) {
        const one = state.api(node), style = parseStyle(one.attr('style'));
        const next = typeof value === 'function' ? value.call(node, index, style[name]) : value;
        if (next === '') delete style[name];
        else if (next != null) style[name] = String(next);
        one.attr('style', Object.entries(style).map(([key, val]) => `${key}: ${val};`).join(' '));
    }
    class Selection {
        #state;
        constructor(state) { this.#state = state; }
        static state(target) { return #state in target ? target.#state : undefined; }
        get cheerio() { return '[cheerio object]'; }
        get length() { return entry(this).ids.length; }
        get(index) {
            const { state, ids } = entry(this);
            if (index === undefined)
                return this.toArray();
            if (!Number.isInteger(index))
                return undefined;
            if (index < 0)
                index += ids.length;
            return index >= 0 && index < ids.length ? wrap(state, ids[index]) : undefined;
        }
        toArray() { return Array.from(this); }
        *[Symbol.iterator]() {
            const { state, ids } = entry(this);
            for (const id of ids)
                yield wrap(state, id);
        }
        eq(index) {
            const { state, ids } = entry(this);
            index = Number(index);
            if (!Number.isInteger(index))
                return selection(state, empty, this);
            if (index < 0)
                index += ids.length;
            return selection(state, index >= 0 && index < ids.length ? ids.subarray(index, index + 1) : empty, this);
        }
        first() { return this.eq(0); }
        last() { return this.eq(-1); }
        slice(start, end) { const { state, ids } = entry(this); return selection(state, ids.subarray(start, end), this); }
        splice(start, deleteCount, ...items) {
            const record = entry(this);
            if (!arguments.length)
                return [];
            const ids = Array.from(record.ids);
            const removed = arguments.length === 1 ? ids.splice(start) : ids.splice(start, deleteCount, ...inputIds(record.state, items));
            record.ids = Uint32Array.from(ids);
            return removed.map(id => wrap(record.state, id));
        }
        find(selector) {
            const { state, ids } = entry(this);
            if (!selector)
                return selection(state, empty, this);
            if (typeof selector !== 'string') {
                const roots = this.toArray();
                const result = state.api(selector).filter((i, node) => roots.some(root => state.api.contains(root, node)));
                entry(result).previous = this;
                return result;
            }
            return selection(state, query(state, selector, ids), this);
        }
        children(selector) { return this._traverse(1, selector); }
        parent(selector) { return this._traverse(2, selector); }
        contents() { return this._traverse(3); }
        _traverse(axis, selector) {
            const { state, ids } = entry(this);
            flush(state);
            // Contents and immediate siblings keep each input occurrence.
            // Other axes deduplicate only after a filter has seen all visits.
            const unique = axis !== 3 && axis !== 4 && axis !== 5;
            let resultIds = kernel.traverse(state.owner, ids, axis | (ids.length > 1 && (selector || !unique) ? 256 : 0));
            if (selector) {
                resultIds = entry(selection(state, resultIds).filter(selector)).ids;
                if (unique && ids.length > 1) resultIds = Uint32Array.from(new Set(resultIds));
            }
            if ((axis === 8 || axis === 9) && ids.length > 1) {
                resultIds = edit(state, 13, resultIds);
                if (axis === 9)
                    resultIds.reverse();
            }
            return selection(state, resultIds, this);
        }
        each(callback) {
            if (typeof callback !== 'function')
                throw new TypeError('Expected a callback');
            const { state, ids } = entry(this);
            for (let i = 0; i < ids.length; i++) {
                // The callback receives a snapshot identity. Its first DOM read flushes
                // pending writes, so callback entry itself need not cross the binding.
                const node = wrap(state, ids[i]);
                if (callback.call(node, i, node) === false)
                    break;
            }
            return this;
        }
        filter(selector) {
            const { state, ids } = entry(this);
            if (!selector)
                return selection(state, empty, this);
            if (typeof selector === 'string')
                return selection(state, query(state, selector, ids, true), this);
            if (typeof selector !== 'function') {
                const wanted = new Set(inputIds(state, selector));
                return selection(state, ids.filter(id => wanted.has(id)), this);
            }
            const result = new Uint32Array(ids.length);
            let length = 0;
            this.each(function (i, node) { if (selector.call(node, i, node))
                result[length++] = ids[i]; });
            return selection(state, result.subarray(0, length), this);
        }
        is(selector) {
            if (typeof selector === 'string') {
                const { state, ids } = entry(this);
                return selector.length > 0 && matches(state, selector, ids);
            }
            if (typeof selector !== 'function')
                return this.filter(selector).length > 0;
            let matched = false;
            this.each(function (i, node) {
                if (selector.call(node, i, node)) {
                    matched = true;
                    return false;
                }
            });
            return matched;
        }
        attr(name, value) {
            const { state, ids } = entry(this);
            if (!arguments.length)
                return attributes(state, ids);
            if (name && typeof name === 'object') {
                return this.each(function () {
                    if (this.nodeType !== 1) return;
                    const one = state.api(this);
                    for (const key of Object.keys(name)) {
                        const val = name[key];
                        one.attr(key, val === null ? null : String(val));
                    }
                });
            }
            if (typeof name !== 'string')
                unsupported('attr currently requires an attribute name.');
            // HTML whitespace is ASCII; NBSP and other Unicode spaces can be
            // part of an attribute name and must survive reads and writes.
            if (!name || /[\x20\t\r\n\f\0"'<>/=]/.test(name))
                throw new TypeError('Invalid attribute name');
            if (arguments.length === 1)
                return attributeValue(state, ids, name);
            if (value === undefined)
                return this;
            if (typeof value === 'function') {
                return attributeCallback(this, state, name, value);
            }
            if (value !== null && typeof value === 'object')
                return this.each(function () { if (this.nodeType === 1) state.api(this).attr(name, String(value)); });
            enqueue(state, ids, value === null ? 2 : 1, name, value === null ? '' : String(value));
            return this;
        }
        removeAttr(names) {
            if (typeof names !== 'string')
                throw new TypeError('Expected attribute names');
            const { state, ids } = entry(this);
            for (const name of names.split(/\s+/))
                if (name)
                    enqueue(state, ids, 2, name);
            return this;
        }
        text(value) {
            const { state, ids } = entry(this);
            if (value === undefined)
                return read(state, ids, 2);
            if (typeof value === 'function')
                return textCallback(this, state, value);
            enqueue(state, ids, 3, String(value));
            return this;
        }
        end() {
            const record = entry(this);
            if (record.previous instanceof Uint32Array)
                record.previous = selection(record.state, record.previous);
            return record.previous ?? selection(record.state, empty);
        }
        map(callback) { return mapped(this, callback); }
        toString() { const { state, ids } = entry(this); return read(state, ids, 10); }
        next(selector) { return this._traverse(4, selector); }
        prev(selector) { return this._traverse(5, selector); }
        nextAll(selector) { return this._traverse(6, selector); }
        prevAll(selector) { return this._traverse(7, selector); }
        siblings(selector) { return this._traverse(8, selector); }
        parents(selector) { return this._traverse(9, selector); }
        nextUntil(stop, selector) { return until(this, 6, stop, selector); }
        prevUntil(stop, selector) { return until(this, 7, stop, selector); }
        parentsUntil(stop, selector) { return until(this, 9, stop, selector); }
        closest(selector, context) {
            const { state } = entry(this), result = [];
            if (selector)
                this.each(function () {
                    for (let node = this; node && node !== context && node.type !== 'root'; node = node.parent) {
                        if (state.api(node).is(selector)) {
                            if (!result.includes(node))
                                result.push(node);
                            break;
                        }
                    }
                });
            return selection(state, inputIds(state, result), this);
        }
        not(selector) {
            if (typeof selector === 'function')
                return this.filter(function (i, node) { return !selector.call(this, i, node); });
            const { state, ids } = entry(this), excluded = new Set(entry(this.filter(selector)).ids);
            return selection(state, ids.filter(id => !excluded.has(id)), this);
        }
        has(selector) { const { state } = entry(this); return this.filter(function () { return state.api(this).find(selector).length > 0; }); }
        add(other, context) {
            const { state, ids } = entry(this), next = inputIds(state, state.api(other, context));
            const joined = new Uint32Array(ids.length + next.length);
            joined.set(ids);
            joined.set(next, ids.length);
            return selection(state, edit(state, 13, joined), this);
        }
        addBack(selector) { if (!entry(this).previous)
            return this; const previous = this.end(); return this.add(selector ? previous.filter(selector) : previous); }
        index(value) {
            const { state } = entry(this);
            if (!this.length)
                return -1;
            if (value === undefined)
                return this.first().parent().children().toArray().indexOf(this[0]);
            if (typeof value === 'string')
                return state.api(value).toArray().indexOf(this[0]);
            return this.toArray().indexOf(nodes.has(value) ? value : state.api(value)[0]);
        }
        hasClass(name) {
            return typeof name === 'string' && name.length > 0 && this.is(function () {
                const value = this.attribs?.class ?? '';
                for (let index = value.indexOf(name); index >= 0; index = value.indexOf(name, index + 1)) {
                    const end = index + name.length;
                    if ((!index || /\s/.test(value[index - 1])) && (end === value.length || /\s/.test(value[end]))) return true;
                }
                return false;
            });
        }
        addClass(value) { return classes(this, 'add', value, undefined, arguments.length); }
        removeClass(value) { return classes(this, 'remove', value, undefined, arguments.length); }
        toggleClass(value, force) { return classes(this, 'toggle', value, force, arguments.length); }
        append(...values) { return content(this, 0, values); }
        prepend(...values) { return content(this, 1, values); }
        before(...values) { return content(this, 2, values); }
        after(...values) { return content(this, 3, values); }
        appendTo(target) { const { state, ids } = entry(this); return selection(state, edit(state, 3 | 256, entry(state.api(target)).ids, ids), this); }
        prependTo(target) { const { state, ids } = entry(this); return selection(state, edit(state, 4 | 256, entry(state.api(target)).ids, ids), this); }
        insertBefore(target) { const { state, ids } = entry(this); return selection(state, edit(state, 14 | 256, entry(state.api(target)).ids, ids), this); }
        insertAfter(target) { const { state, ids } = entry(this); return selection(state, edit(state, 15 | 256, entry(state.api(target)).ids, ids), this); }
        clone() { const { state, ids } = entry(this); return selection(state, edit(state, 2, ids), this); }
        empty() { const { state, ids } = entry(this); enqueue(state, ids, 7); return this; }
        remove(selector) { const { state, ids } = entry(selector ? this.filter(selector) : this); enqueue(state, ids, 6); return this; }
        detach(selector) { return this.remove(selector); }
        replaceWith(value) {
            const { state, ids } = entry(this);
            if (typeof value === 'function')
                return this.each(function (i, node) { state.api(node).replaceWith(value.call(node, i, node)); });
            if (typeof value === 'string') {
                this.before(value);
                this.remove();
            }
            else
                edit(state, 7, ids, value == null ? empty : inputIds(state, value));
            return this;
        }
        html(value) {
            const { state, ids } = entry(this);
            if (value === undefined)
                return read(state, ids, 3);
            if (typeof value === 'function')
                return this.each(function (i, node) {
                    if (!['tag', 'script', 'style', 'root'].includes(node.type)) return;
                    const one = state.api(node);
                    one.html(value.call(node, i, one.html()));
                });
            if (typeof value === 'string' || value === null)
                enqueue(state, ids, 4, value ?? '');
            else {
                const contentIds = inputIds(state, value);
                this.empty();
                edit(state, 3, ids, contentIds);
            }
            return this;
        }
        wrapAll(wrapper) {
            const { state } = entry(this);
            if (!this.length)
                return this;
            if (typeof wrapper === 'function')
                wrapper = wrapper.call(this[0], 0, this[0]);
            const inserted = state.api(wrapper).insertBefore(this.first());
            let inner = inserted.filter(function () {
                if (this.nodeType !== 1) return false;
                const name = this.name;
                return name !== 'script' && name !== 'style';
            }).last();
            while (inner.length) {
                let next;
                // Cheerio's wrapper clones give lowercase script/style their
                // distinct types in both modes. children() yields only elements.
                for (const child of inner.children()) {
                    const name = child.name;
                    if (name !== 'script' && name !== 'style') { next = child; break; }
                }
                if (!next) break;
                inner = state.api(next);
            }
            if (inner.length)
                inner.append(this);
            return this;
        }
        wrap(wrapper) { return wrapping(this, wrapper, false); }
        wrapInner(wrapper) { return wrapping(this, wrapper, true); }
        unwrap(selector) {
            const { state } = entry(this);
            this.parent(selector).not('body').each(function () { const one = state.api(this); one.replaceWith(one.contents()); });
            return this;
        }
        prop(name, value) {
            const { state, ids } = entry(this);
            if (name && typeof name === 'object') {
                return this.each(function () {
                    if (this.nodeType !== 1) return;
                    const one = state.api(this);
                    for (const key of Object.keys(name)) setProperty(one, key, name[key]);
                });
            }
            if (value !== undefined) {
                if (typeof value === 'function')
                    return this.each(function (i, node) {
                        if (node.nodeType !== 1) return;
                        const one = state.api(node);
                        // Cheerio callbacks read raw properties/attributes, not
                        // formatted tag names, resolved URLs or parsed styles.
                        // GroveDOM's derived setters retain their callback values.
                        const old = name === 'tagName' ? node.name
                            : rawProperties.has(name) || ['nodeName', 'innerHTML', 'textContent', 'innerText'].includes(name)
                                || (!state.xml && boolAttributes.has(name.toLowerCase())) ? one.prop(name) : one.attr(name);
                        setProperty(one, name, value.call(node, i, old));
                    });
                return setProperty(this, name, value);
            }
            if (!ids.length || typeof name !== 'string')
                return undefined;
            if (name === 'tagName' || name === 'nodeName')
                return read(state, ids, 5)?.toUpperCase();
            if (name === 'innerHTML')
                return this.html();
            if (name === 'outerHTML')
                return read(state, ids, 4);
            if (name === 'textContent' || name === 'innerText')
                return read(state, ids[0], name === 'innerText' ? 9 : 2);
            if (name === 'style') {
                const values = this.css();
                if (!values)
                    return undefined;
                const keys = Object.keys(values);
                return Object.assign(values, keys, { length: keys.length });
            }
            if (!state.xml && boolAttributes.has(name.toLowerCase()))
                return this.attr(name) !== undefined;
            if (name === 'data' && !state.data.has(ids[0]) && this[0].nodeType === 1)
                return this.attr(name);
            if (rawProperties.has(name))
                return this[0][name];
            const result = this.attr(name);
            if (result !== undefined && (name === 'href' || name === 'src') && state.baseURI) {
                const tag = read(state, ids, 5);
                if ((name === 'href' ? ['a', 'link'] : ['img', 'iframe', 'audio', 'video', 'source']).includes(tag)) {
                    try {
                        return new URL(result, state.baseURI).href;
                    }
                    catch { }
                }
            }
            return result;
        }
        css(name, value) {
            const { state } = entry(this);
            if (name && typeof name === 'object' && !Array.isArray(name)) {
                return this.each(function () {
                    if (this.nodeType !== 1) return;
                    const keys = Object.keys(name);
                    for (let i = 0; i < keys.length; i++) setStyle(state, this, keys[i], name[keys[i]], i);
                });
            }
            if (!this.length)
                return value === undefined ? undefined : this;
            if (value === undefined) {
                if (this[0].nodeType !== 1) return undefined;
                const style = parseStyle(this.attr('style'));
                return name === undefined ? style : Array.isArray(name) ? Object.fromEntries(name.filter(key => key in style).map(key => [key, style[key]])) : style[name];
            }
            return this.each(function (i, node) {
                if (node.nodeType !== 1) return;
                setStyle(state, node, name, value, i);
            });
        }
        data(name, value) { return data(this, name, value); }
        removeData(name) { return removeData(this, name); }
        val(value) {
            const { state } = entry(this);
            if (value === undefined) {
                if (!this.length)
                    return undefined;
                const one = this.first(), name = one[0].name;
                if (name === 'textarea')
                    return one.text();
                if (name === 'select') {
                    const selected = one.find('option:selected');
                    if (one.attr('multiple'))
                        return selected.map(function () { return state.api(this).text(); }).get();
                    return selected.attr('value');
                }
                return ['input', 'button', 'option'].includes(name) ? one.attr('value') : undefined;
            }
            if (typeof value === 'function')
                return this.each(function (i, node) { const one = state.api(node); one.val(value.call(node, i, one.val())); });
            if (!this.length || this[0].nodeType !== 1) return this;
            const name = this[0].name;
            if (name === 'textarea') return this.text(value);
            if (name === 'select') {
                if (typeof value === 'object' && this.attr('multiple') === undefined) return this;
                const values = (Array.isArray(value) ? value : [value]).map(String);
                this.find('option').each(function () { const option = state.api(this); option.attr('selected', values.includes(this.attribs.value) ? '' : null); });
                return this;
            }
            return ['input', 'button', 'option'].includes(name) ? this.attr('value', value) : undefined;
        }
        serializeArray() {
            const { state } = entry(this), fields = [], result = [];
            const excluded = state.xml ? /^(?:submit|button|image|reset|file)$/ : /^(?:submit|button|image|reset|file)$/i;
            const checkable = state.xml ? /^(?:checkbox|radio)$/ : /^(?:checkbox|radio)$/i;
            this.each(function () {
                if (this.name === 'form') {
                    for (const node of state.api(this).find('input,select,textarea,keygen')) fields.push(node);
                } else fields.push(this);
            });
            for (const node of fields) {
                const field = state.api(node), name = field.attr('name'), type = field.attr('type') ?? '';
                if (!name || field.attr('disabled') !== undefined || !['input', 'select', 'textarea', 'keygen'].includes(node.name) || excluded.test(type) || (checkable.test(type) && field.attr('checked') === undefined))
                    continue;
                const value = field.val() ?? '';
                for (const item of Array.isArray(value) ? value : [value])
                    result.push({ name, value: String(item).replace(/\r?\n/g, '\r\n') });
            }
            return result;
        }
        serialize() { return this.serializeArray().map(({ name, value }) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&').replace(/%20/g, '+'); }
        extract(map) {
            const { state } = entry(this), result = {};
            for (const key in map) {
                const item = map[key];
                const array = Array.isArray(item), descriptor = array ? item[0] : item;
                const config = typeof descriptor === 'string' ? { selector: descriptor, value: 'textContent' } : descriptor;
                // Descriptor getters run once, before selection, even with no
                // matches. Callbacks may change the descriptor for a later extract.
                const selector = config.selector, value = config.value ?? 'textContent';
                const selected = this.find(selector), output = [];
                (array ? selected : selected.first()).each(function (i, node) {
                    const extracted = typeof value === 'function' ? value(node, key, result) : typeof value === 'object' ? state.api(node).extract(value) : state.api(node).prop(value);
                    if (array && Array.isArray(extracted)) {
                        for (const item of extracted) output.push(item);
                    } else if (!array || extracted != null) output.push(extracted);
                });
                result[key] = array ? output : output[0];
            }
            return result;
        }
    }
    return Selection;
}
