import { alive, empty } from './common.js';
export function createNodes(kernel, operations, selections, selection) {
    const { flush, read, edit, enqueue, attributes, attributeValue } = operations;
    const nodes = { get: value => NodeHandle.record(value), has: value => NodeHandle.record(value) !== undefined };
    function rawAxis(node, axis) {
        const { state, ids } = nodes.get(node);
        flush(state);
        const result = kernel.traverse(state.owner, ids, axis);
        return result.length ? wrap(state, result[0]) : null;
    }
    function wrap(state, id) {
        alive(state);
        let node = state.wrappers.get(id);
        if (!node) {
            node = Object.freeze(new NodeHandle(state, id));
            state.wrappers.set(id, node);
        }
        return node;
    }
    function inputIds(state, input) {
        const value = selections.get(input) ?? nodes.get(input);
        if (value) {
            alive(value.state);
            if (value.state !== state)
                throw new TypeError('Nodes belong to another document');
            return value.ids;
        }
        if (Array.isArray(input)) {
            const ids = new Uint32Array(input.length);
            for (let i = 0; i < input.length; i++) {
                const value = nodes.get(input[i]);
                if (!value || value.state !== state)
                    throw new TypeError('Expected nodes from this document');
                ids[i] = value.ids[0];
            }
            return ids;
        }
        throw new TypeError('Expected a selector, node handle, or selection');
    }
    class XMLNodeRecord {
        #ids;
        constructor(state, id) { this.state = state; this.id = id; }
        get ids() { return this.#ids ??= Uint32Array.of(this.id); }
    }
    function callbackIds(state, node) {
        const record = nodes.get(node);
        alive(state);
        // Borrow this only for the immediate read/enqueue. Reacquire after calling
        // user code (including string coercion), which can reenter another callback.
        const ids = state.callbackIds ??= new Uint32Array(1);
        ids[0] = record.id;
        return ids;
    }
    function xmlAttributeCallback(target, state, name, value) {
        return target.each(function (i, node) {
            const next = value.call(node, i, attributeValue(state, callbackIds(state, node), name));
            if (next !== undefined)
                alive(state);
            if (typeof next === 'function')
                selection(state, nodes.get(node).ids).attr(name, next);
            else if (next !== undefined) {
                const text = next === null ? '' : String(next);
                enqueue(state, callbackIds(state, node), next === null ? 2 : 1, name, text);
            }
        });
    }
    function xmlTextCallback(target, state, value) {
        return target.each(function (i, node) {
            const next = value.call(node, i, read(state, callbackIds(state, node), 2));
            alive(state);
            if (typeof next === 'function')
                selection(state, nodes.get(node).ids).text(next);
            else if (next !== undefined) {
                const text = String(next);
                enqueue(state, callbackIds(state, node), 3, text);
            }
        });
    }
    class NodeHandle {
        #record;
        constructor(state, id) { this.#record = state.xml ? new XMLNodeRecord(state, id) : { state, ids: Uint32Array.of(id) }; }
        static record(value) { return value !== null && typeof value === 'object' && #record in value ? value.#record : undefined; }
        get name() { const { state, ids } = nodes.get(this); return read(state, ids, 5); }
        get type() {
            const { state, ids } = nodes.get(this);
            const type = read(state, ids, 6);
            if (type === 1) {
                if (state.xml)
                    return 'tag';
                const name = read(state, ids, 5);
                return name === 'script' || name === 'style' ? name : 'tag';
            }
            return ({ 3: 'text', 4: 'cdata', 7: 'directive', 8: 'comment', 9: 'root', 10: 'directive', 11: 'root' })[type];
        }
    }
    const originalName = Object.getOwnPropertyDescriptor(NodeHandle.prototype, 'name').get;
    Object.defineProperties(NodeHandle.prototype, {
        name: { get: originalName, set(value) { const { state, ids } = nodes.get(this); edit(state, 11, ids, empty, String(value)); } },
        tagName: { get: originalName, set(value) { this.name = value; } },
        nodeType: { get() { const { state, ids } = nodes.get(this); const type = read(state, ids, 6); return type === 11 ? 9 : type; } },
        parent: { get() { return rawAxis(this, 10); } },
        parentNode: { get() { return this.parent; } },
        next: { get() { return rawAxis(this, 11); } },
        nextSibling: { get() { return this.next; } },
        prev: { get() { return rawAxis(this, 12); } },
        previousSibling: { get() { return this.prev; } },
        children: { get() { const { state, ids } = nodes.get(this); return selection(state, ids).contents().toArray(); } },
        childNodes: { get() { return this.children; } },
        firstChild: { get() { return this.children[0] ?? null; } },
        lastChild: { get() { return this.children.at(-1) ?? null; } },
        data: { get() { const { state, ids } = nodes.get(this); return state.data.get(ids[0]) ?? read(state, ids, 8); }, set(value) { const { state, ids } = nodes.get(this); edit(state, 12, ids, empty, String(value)); } },
        attribs: { get() {
                const data = nodes.get(this), { state, ids } = data;
                if (read(state, ids, 6) !== 1)
                    return undefined;
                if (!data.attribs)
                    data.attribs = new Proxy({}, {
                        get: (_, name) => typeof name === 'string' ? read(state, ids, 1, name) : undefined,
                        set: (_, name, value) => { enqueue(state, ids, 1, String(name), String(value)); return true; },
                        deleteProperty: (_, name) => { enqueue(state, ids, 2, String(name)); return true; },
                        has: (_, name) => read(state, ids, 1, String(name)) !== undefined,
                        ownKeys: () => Object.keys(attributes(state, ids)),
                        getOwnPropertyDescriptor: (_, name) => { const value = read(state, ids, 1, String(name)); return value === undefined ? undefined : { configurable: true, enumerable: true, writable: true, value }; },
                    });
                return data.attribs;
            } },
    });
    return { nodes, wrap, inputIds, xmlAttributeCallback, xmlTextCallback };
}
