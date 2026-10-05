// Cheerio caches each requested key independently. Reading one key must not
// snapshot unrelated attributes, and explicit keys retain their spelling.
const ownValue = (object, key, value) => Object.defineProperty(object, key, {
    configurable: true, enumerable: true, writable: true, value,
});
const camel = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
function parse(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (String(Number(value)) === value) return Number(value);
    if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(value)) {
        try { return JSON.parse(value); } catch { }
    }
    return value;
}
export function createDataMethods({ entry, nodes, read, attributes }) {
    function store(state, node) {
        const id = nodes.get(node).ids[0];
        let result = state.data.get(id);
        if (!result) state.data.set(id, result = {});
        return result;
    }
    function data(source, name, value) {
        const { state, ids } = entry(source);
        if (!ids.length || source[0].nodeType !== 1) return undefined;
        const result = store(state, source[0]);
        if (name == null) {
            for (const [key, val] of Object.entries(attributes(state, ids))) {
                if (key.startsWith('data-') && !Object.hasOwn(result, camel(key.slice(5))))
                    ownValue(result, camel(key.slice(5)), parse(val));
            }
            return result;
        }
        if (typeof name === 'object' || value !== undefined) {
            return source.each(function () {
                if (this.nodeType !== 1) return;
                const target = store(state, this);
                if (typeof name === 'object') {
                    for (const key of Object.keys(name)) ownValue(target, key, name[key]);
                } else ownValue(target, name, value);
            });
        }
        if (Object.hasOwn(result, name)) return result[name];
        const attr = 'data-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
        const raw = read(state, ids, 1, attr);
        if (raw === undefined) return undefined;
        const parsed = parse(raw);
        ownValue(result, name, parsed);
        return parsed;
    }
    function removeData(source, name) {
        const { state } = entry(source);
        return source.each(function () {
            const id = nodes.get(this).ids[0];
            if (name === undefined) state.data.delete(id);
            else {
                const data = state.data.get(id);
                if (data) for (const key of name.match(/\S+/g) ?? []) delete data[key];
            }
        });
    }
    return { data, removeData };
}
