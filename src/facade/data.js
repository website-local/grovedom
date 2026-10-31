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
    const number = Number(value);
    if (String(number) === value) return number;
    if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(value)) {
        try { return JSON.parse(value); } catch { }
    }
    return value;
}
export function createDataMethods({ entry, wrap, read, attributes }) {
    function store(state, node) {
        const id = node._state.id;
        let result = state.data.get(id);
        if (result == null) state.data.set(id, result = {});
        return result;
    }
    function data(source, name, value) {
        const { state, ids } = entry(source);
        if (!ids.length) return undefined;
        const node = wrap(state, ids[0]);
        if (node.nodeType !== 1) return undefined;
        const result = store(state, node);
        if (name == null) {
            for (const [key, val] of Object.entries(attributes(state, ids))) {
                if (!key.startsWith('data-')) continue;
                const name = camel(key.slice(5));
                if (!Object.hasOwn(result, name)) ownValue(result, name, parse(val));
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
        const { state } = source._state;
        return source.each(function () {
            const id = this._state.id;
            if (name === undefined) state.data.delete(id);
            else {
                const data = state.data.get(id);
                if (data) for (const key of name.match(/\S+/g) ?? []) delete data[key];
            }
        });
    }
    return { data, removeData };
}
