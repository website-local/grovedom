import { alive, unsupported, empty, boolAttributes } from './common.js';
import { parseStyle } from './style.js';
// Methods keep private branding and selection snapshots. Helpers are bound once.
export function createSelection(context) {
    const { kernel, entry, wrap, selection, inputIds, query, matches, flush, edit, nodes, attributes, attributeValue, enqueue, read, xmlAttributeCallback, xmlTextCallback, mapped, until, classes, content, wrapping, data, removeData } = context;
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
                return state.api(selector).filter((i, node) => roots.some(root => state.api.contains(root, node)));
            }
            return selection(state, query(state, selector, ids), this);
        }
        children(selector) { return this._traverse(1, selector); }
        parent(selector) { return this._traverse(2, selector); }
        contents() { return this._traverse(3); }
        _traverse(axis, selector) {
            const { state, ids } = entry(this);
            flush(state);
            let resultIds = kernel.traverse(state.owner, ids, axis | (selector && ids.length > 1 ? 256 : 0));
            if (selector) {
                resultIds = entry(selection(state, resultIds).filter(selector)).ids;
                if (ids.length > 1) resultIds = Uint32Array.from(new Set(resultIds));
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
                if (state.xml)
                    return xmlAttributeCallback(this, state, name, value);
                return this.each(function (i, node) {
                    const one = nodes.get(node).ids;
                    const old = read(state, one, 1, name);
                    if (old === undefined && node.nodeType !== 1)
                        return;
                    const next = value.call(node, i, old);
                    enqueue(state, one, next === null ? 2 : 1, name, next === null ? '' : String(next));
                });
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
            if (typeof value === 'function' && state.xml)
                return xmlTextCallback(this, state, value);
            if (typeof value === 'function')
                return this.each(function (i, node) {
                    const one = nodes.get(node).ids;
                    const next = value.call(node, i, read(state, one, 2));
                    alive(state);
                    if (typeof next === 'function')
                        selection(state, one).text(next);
                    else if (next !== undefined)
                        enqueue(state, one, 3, String(next));
                });
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
            const { state, ids } = entry(this), excluded = new Set(entry(this.filter(selector)).ids);
            return selection(state, ids.filter(id => !excluded.has(id)), this);
        }
        has(selector) { const { state } = entry(this); return this.filter(function () { return state.api(this).find(selector).length > 0; }); }
        add(other, context) {
            const { state, ids } = entry(this), next = entry(state.api(other, context)).ids;
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
            let inner = inserted.filter(function () { return this.type === 'tag'; }).last();
            while (inner.children().length)
                inner = inner.children().first();
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
                for (const [key, val] of Object.entries(name))
                    this.prop(key, val);
                return this;
            }
            if (value !== undefined) {
                if (typeof value === 'function')
                    return this.each(function (i, node) { const one = state.api(node); one.prop(name, value.call(node, i, one.prop(name))); });
                if (name === 'namespace')
                    unsupported('Changing node namespaces is not supported.');
                if (name === 'attribs')
                    return this.each(function () { const one = state.api(this); one.removeAttr(Object.keys(one.attr() ?? {}).join(' ')); if (value)
                        one.attr(value); });
                if (name === 'tagName' || name === 'nodeName' || name === 'name') {
                    edit(state, 11, ids, empty, String(value));
                    return this;
                }
                if (name === 'innerHTML')
                    return this.html(value);
                if (name === 'textContent' || name === 'innerText')
                    return this.text(value);
                return this.attr(name, !state.xml && boolAttributes.has(name.toLowerCase()) ? value ? '' : null : value);
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
                return read(state, ids.subarray(0, 1), name === 'innerText' ? 9 : 2);
            if (name === 'style') {
                const values = this.css();
                if (!values)
                    return undefined;
                const keys = Object.keys(values);
                return Object.assign(values, keys, { length: keys.length });
            }
            if (!state.xml && boolAttributes.has(name.toLowerCase()))
                return this.attr(name) !== undefined;
            if (['name', 'type', 'children', 'childNodes', 'parent', 'parentNode', 'next', 'prev', 'data', 'attribs', 'nodeType'].includes(name))
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
            if (!this.length)
                return value === undefined ? undefined : this;
            if (name && typeof name === 'object' && !Array.isArray(name)) {
                for (const [key, val] of Object.entries(name))
                    this.css(key, val);
                return this;
            }
            if (value === undefined) {
                if (this[0].nodeType !== 1) return undefined;
                const style = parseStyle(this.attr('style'));
                return name === undefined ? style : Array.isArray(name) ? Object.fromEntries(name.filter(key => key in style).map(key => [key, style[key]])) : style[name];
            }
            return this.each(function (i, node) {
                if (node.nodeType !== 1) return;
                const one = state.api(node), style = parseStyle(one.attr('style'));
                const next = typeof value === 'function' ? value.call(node, i, style[name]) : value;
                if (next === '')
                    delete style[name];
                else if (next != null)
                    style[name] = String(next);
                one.attr('style', Object.entries(style).map(([key, val]) => `${key}: ${val};`).join(' '));
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
                    if (one.attr('multiple') !== undefined)
                        return selected.map(function () { return state.api(this).text(); }).get();
                    return selected.attr('value');
                }
                return ['input', 'button', 'option'].includes(name) ? one.attr('value') : undefined;
            }
            return this.each(function (i, node) {
                const one = state.api(node), next = typeof value === 'function' ? value.call(node, i, one.val()) : value;
                if (node.name === 'textarea')
                    one.text(next == null ? '' : next);
                else if (node.name === 'select') {
                    if (Array.isArray(next) && one.attr('multiple') === undefined) return;
                    const values = (Array.isArray(next) ? next : [next]).map(String);
                    one.find('option').each(function () { const option = state.api(this); option.attr('selected', values.includes(this.attribs.value) ? '' : null); });
                }
                else
                    one.attr('value', next == null ? '' : String(next));
            });
        }
        serializeArray() {
            const { state } = entry(this), fields = [], result = [];
            this.each(function () { const one = state.api(this); fields.push(...(this.name === 'form' ? one.find('input,select,textarea,keygen').get() : one.get())); });
            for (const node of fields) {
                const field = state.api(node), name = field.attr('name'), type = field.attr('type') ?? '';
                if (!name || field.attr('disabled') !== undefined || !['input', 'select', 'textarea', 'keygen'].includes(node.name) || /^(?:submit|button|image|reset|file)$/i.test(type) || (/^(?:checkbox|radio)$/i.test(type) && field.attr('checked') === undefined))
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
            for (const [key, item] of Object.entries(map)) {
                const array = Array.isArray(item), descriptor = array ? item[0] : item;
                const config = typeof descriptor === 'string' ? { selector: descriptor, value: 'textContent' } : descriptor;
                const selected = this.find(config.selector), output = [];
                (array ? selected : selected.first()).each(function (i, node) {
                    const value = config.value ?? 'textContent';
                    output.push(typeof value === 'function' ? value(node, key, result) : typeof value === 'object' ? state.api(node).extract(value) : state.api(node).prop(value));
                });
                result[key] = array ? output.filter(value => value != null) : output[0];
            }
            return result;
        }
    }
    return Selection;
}
