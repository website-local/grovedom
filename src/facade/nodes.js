import { alive, empty } from './common.js';
export function createNodes(kernel, operations, selections, selection) {
    const { flush, read, edit, enqueue, attributes, attributeValue } = operations;
    const nodes = { get: value => NodeHandle.record(value), has: value => NodeHandle.record(value) !== undefined };
    function nodeIds(record) {
        if (record.ids) return record.ids;
        const ids = new Uint32Array(1);
        ids[0] = record.id;
        return record.ids = ids;
    }
    function rawAxis(node, axis) {
        const record = nodes.get(node), { state } = record, ids = nodeIds(record);
        flush(state);
        const result = kernel.traverse(state.owner, ids, axis);
        return result.length ? wrap(state, result[0]) : null;
    }
    function rawChild(node, operation) {
        const record = nodes.get(node), { state } = record;
        const id = read(state, record.id, operation);
        return id ? wrap(state, id) : null;
    }
    function rawChildren(node) {
        const record = nodes.get(node), { state } = record;
        flush(state);
        const ids = kernel.traverse(state.owner, nodeIds(record), 3);
        const children = new Array(ids.length);
        for (let i = 0; i < ids.length; i++) children[i] = wrap(state, ids[i]);
        return children;
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
            return nodeIds(value);
        }
        if (Array.isArray(input)) {
            const ids = new Uint32Array(input.length);
            for (let i = 0; i < input.length; i++) {
                const value = nodes.get(input[i]);
                if (!value || value.state !== state)
                    throw new TypeError('Expected nodes from this document');
                ids[i] = value.id;
            }
            return ids;
        }
        throw new TypeError('Expected a selector, node handle, or selection');
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
    function attributeCallback(target, state, name, value) {
        return target.each(function (i, node) {
            const old = read(state, callbackIds(state, node), 1, name);
            if (old === undefined && node.nodeType !== 1)
                return;
            const next = value.call(node, i, old);
            const text = next === null ? '' : String(next);
            enqueue(state, callbackIds(state, node), next === null ? 2 : 1, name, text);
        });
    }
    function textCallback(target, state, value) {
        return target.each(function (i, node) {
            const next = value.call(node, i, read(state, callbackIds(state, node), 2));
            alive(state);
            if (typeof next === 'function')
                selection(state, nodeIds(nodes.get(node))).text(next);
            else if (next !== undefined) {
                const text = String(next);
                enqueue(state, callbackIds(state, node), 3, text);
            }
        });
    }
    class NodeHandle {
        #record;
        // Keep the shared state/ids fields in the same order as selection
        // records. Materialize a stable array only when an API needs one.
        constructor(state, id) { this.#record = { state, ids: null, id }; }
        static record(value) { return value !== null && typeof value === 'object' && #record in value ? value.#record : undefined; }
        get name() { const { state, id } = nodes.get(this); return read(state, id, 5); }
        get type() {
            const { state, id } = nodes.get(this);
            const type = read(state, id, 6);
            if (type === 1) {
                if (state.xml)
                    return 'tag';
                const name = read(state, id, 5);
                return name === 'script' || name === 'style' ? name : 'tag';
            }
            return ({ 3: 'text', 4: 'cdata', 7: 'directive', 8: 'comment', 9: 'root', 10: 'directive', 11: 'root' })[type];
        }
    }
    const originalName = Object.getOwnPropertyDescriptor(NodeHandle.prototype, 'name').get;
    Object.defineProperties(NodeHandle.prototype, {
        name: { get: originalName, set(value) { const record = nodes.get(this); edit(record.state, 11, nodeIds(record), empty, String(value)); } },
        tagName: { get: originalName, set(value) { this.name = value; } },
        nodeType: { get() { const { state, id } = nodes.get(this); const type = read(state, id, 6); return type === 11 ? 9 : type; } },
        parent: { get() { return rawAxis(this, 10); } },
        parentNode: { get() { return this.parent; } },
        next: { get() { return rawAxis(this, 11); } },
        nextSibling: { get() { return this.next; } },
        prev: { get() { return rawAxis(this, 12); } },
        previousSibling: { get() { return this.prev; } },
        children: { get() { return rawChildren(this); } },
        childNodes: { get() { return this.children; } },
        firstChild: { get() { return rawChild(this, 13); } },
        lastChild: { get() { return rawChild(this, 14); } },
        data: {
            get() { const { state, id } = nodes.get(this); const value = state.data.get(id); return value === undefined ? read(state, id, 8) : value; },
            set(value) {
                const record = nodes.get(this), { state } = record, ids = nodeIds(record);
                // Kind is immutable, including across element renames. Learn it
                // only on this path, but preserve the pre-coercion observation.
                if (record.dataType === undefined) record.dataType = read(state, ids, 6);
                else flush(state);
                if (record.dataType === 1) state.data.set(ids[0], value);
                else edit(state, 12, ids, empty, String(value));
            },
        },
        attribs: { get() {
                const data = nodes.get(this), { state, id } = data;
                if (read(state, id, 6) !== 1)
                    return undefined;
                if (!data.attribs)
                    data.attribs = new Proxy({}, {
                        get: (_, name) => typeof name === 'string' ? liveAttribute(state, id, name) : undefined,
                        set: (_, name, value) => { enqueue(state, nodeIds(data), 1, String(name), String(value)); return true; },
                        deleteProperty: (_, name) => { enqueue(state, nodeIds(data), 2, String(name)); return true; },
                        has: (_, name) => liveAttribute(state, id, String(name)) !== undefined,
                        ownKeys: () => {
                            const value = attributes(state, id);
                            state.attributeSnapshot = { id, value };
                            return Object.keys(value);
                        },
                        getOwnPropertyDescriptor: (_, name) => { const value = liveAttribute(state, id, String(name)); return value === undefined ? undefined : { configurable: true, enumerable: true, writable: true, value }; },
                    });
                return data.attribs;
            } },
    });
    function liveAttribute(state, id, name) {
        alive(state);
        // Only one private enumeration snapshot is retained per document. Every
        // queued or immediate mutation invalidates it before any later read.
        const snapshot = state.attributeSnapshot;
        if (snapshot?.id === id && Object.hasOwn(snapshot.value, name))
            return snapshot.value[name];
        return read(state, id, 1, name);
    }
    return { nodes, wrap, inputIds, nodeIds, attributeCallback, textCallback };
}
