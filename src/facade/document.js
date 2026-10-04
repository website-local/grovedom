import { alive, unsupported, empty } from './common.js';
import { xmlFlags, serializerOptions } from './options.js';
import { createOperations } from './operations.js';
import { createNodes } from './nodes.js';
import { createSelection } from './selection.js';
import { createCollectionHelpers } from './collection-helpers.js';
// Each package owns an independent facade, kernel and handle brand.
export function createFacade(kernel, decodeInput) {
    const selections = new WeakMap();
    const operations = createOperations(kernel);
    const { flush, read, query, edit } = operations;
    const nodeAPI = createNodes(kernel, operations, selections, selection);
    const { nodes, inputIds } = nodeAPI;
    const context = { kernel, selections, selection, entry, ...operations, ...nodeAPI };
    const Selection = createSelection({ ...context, ...createCollectionHelpers(context) });
    const numericKey = /^(0|[1-9][0-9]*)$/;
    const selectionProxy = {
        get(target, key, receiver) {
            if (typeof key === 'string' && numericKey.test(key))
                return target.get(Number(key));
            return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
            if (typeof key === 'string' && numericKey.test(key)) {
                const data = entry(target), ids = inputIds(data.state, value);
                if (Number(key) >= data.ids.length || ids.length !== 1)
                    throw new TypeError('Expected an existing selection index and one node');
                // Selections created by slice/eq can share storage until explicitly edited.
                data.ids = data.ids.slice();
                data.ids[Number(key)] = ids[0];
                return true;
            }
            return Reflect.set(target, key, value, receiver);
        },
        has(target, key) { return typeof key === 'string' && numericKey.test(key) ? Number(key) < entry(target).ids.length : Reflect.has(target, key); },
        ownKeys(target) { return [...Array.from({ length: entry(target).ids.length }, (_, i) => String(i)), ...Reflect.ownKeys(target)]; },
        getOwnPropertyDescriptor(target, key) {
            if (typeof key === 'string' && numericKey.test(key) && Number(key) < entry(target).ids.length)
                return { configurable: true, enumerable: true, value: target.get(Number(key)) };
            return Reflect.getOwnPropertyDescriptor(target, key);
        },
    };
    function entry(selection) {
        const value = selections.get(selection) ?? Selection.state(selection);
        if (!value)
            throw new TypeError('Expected a GroveDOM selection');
        alive(value.state);
        return value;
    }
    function selection(state, ids, previous) {
        const value = { state, ids, previous };
        const target = new Selection(value);
        const proxy = new Proxy(target, selectionProxy);
        selections.set(proxy, value);
        return proxy;
    }
    function load(content, options = {}, isDocument = true) {
        content = decodeInput(content);
        if (typeof content !== 'string')
            unsupported('load accepts HTML strings or UTF-8 byte arrays.');
        options ??= {};
        if (typeof options !== 'object' || Array.isArray(options))
            throw new TypeError('Expected parser options');
        for (const key of Object.keys(options))
            if (!['scriptingEnabled', 'execution', 'baseURI', 'xml', 'xmlMode'].includes(key))
                unsupported(`Unsupported parser option: ${key}`);
        if (options.scriptingEnabled !== undefined && typeof options.scriptingEnabled !== 'boolean')
            throw new TypeError('Expected scriptingEnabled boolean');
        if (typeof isDocument !== 'boolean')
            throw new TypeError('Expected isDocument boolean');
        if (options.execution !== undefined && !['buffered', 'direct'].includes(options.execution))
            throw new TypeError('Expected buffered or direct execution');
        if (options.xmlMode !== undefined && typeof options.xmlMode !== 'boolean')
            throw new TypeError('Expected xmlMode boolean');
        if (options.xml !== undefined && typeof options.xml !== 'boolean' && (!options.xml || typeof options.xml !== 'object' || Array.isArray(options.xml)))
            throw new TypeError('Expected xml boolean or options');
        const xml = Boolean(options.xml || options.xmlMode);
        const state = {
            owner: xml ? kernel.createXML(content, xmlFlags(options)) : kernel.create(content, options.scriptingEnabled ?? true, !isDocument),
            xml,
            serialization: typeof options.xml === 'object' ? { ...options.xml } : undefined,
            closed: false, direct: options.execution === 'direct', wrappers: new Map(), data: new Map(), baseURI: options.baseURI,
            words: new Uint32Array(256), payload: new Uint8Array(1024), wordLength: 0, byteLength: 0,
            usedWords: null, usedPayload: null, callbackIds: null,
        };
        const rootIds = Uint32Array.of(1);
        function $(input, context) {
            alive(state);
            if (!input)
                return selection(state, empty);
            if (typeof input !== 'string') {
                if (context !== undefined)
                    unsupported('Node inputs with a context are not supported.');
                return selection(state, inputIds(state, input));
            }
            if (input.trimStart().startsWith('<') && input.trimEnd().endsWith('>')) {
                const result = selection(state, edit(state, 1, empty, empty, input));
                if (context && typeof context === 'object' && !nodes.has(context) && !selections.has(context) && !Array.isArray(context))
                    for (const [key, value] of Object.entries(context))
                        typeof result[key] === 'function' ? result[key](value) : result.attr(key, value);
                return result;
            }
            if (context !== undefined && typeof context !== 'string') {
                const contextState = selections.get(context)?.state ?? nodes.get(context)?.state;
                if (contextState && contextState !== state)
                    return contextState.api(context).find(input);
            }
            let roots;
            if (typeof context === 'string' && context.trimStart().startsWith('<')) {
                const fragment = $(context);
                roots = fragment.length ? inputIds(state, fragment[0].parent) : empty;
            }
            else
                roots = context === undefined ? rootIds : typeof context === 'string' ? entry($(context)).ids : inputIds(state, context);
            return selection(state, query(state, input, roots));
        }
        state.api = $;
        $.prototype = Selection.prototype;
        $.root = () => { alive(state); return selection(state, rootIds); };
        $.html = (input, options) => {
            if (input && typeof input === 'object' && !nodes.has(input) && !selections.has(input) && !Array.isArray(input)) {
                options = input;
                input = undefined;
            }
            if (options !== undefined) {
                const flags = serializerOptions(state, options);
                if (selections.has(input))
                    return input.toString();
                if (flags !== null)
                    return read(state, input == null ? rootIds : entry($(input)).ids, 12 | (flags << 8));
            }
            return input === undefined ? read(state, rootIds, 3) : read(state, entry($(input)).ids, 10);
        };
        $.xml = input => {
            alive(state);
            return selections.has(input) ? input.toString() : read(state, input === undefined ? rootIds : entry($(input)).ids, 11);
        };
        $.text = input => read(state, input === undefined ? rootIds : entry($(input)).ids, 2);
        $.contains = (container, contained) => {
            alive(state);
            return contains(container, contained);
        };
        $.parseHTML = (html, context, keepScripts) => {
            if (typeof html !== 'string' || !html)
                return null;
            const parsed = selection(state, edit(state, 1, empty, empty, html));
            if (keepScripts ?? (typeof context === 'boolean' ? context : false))
                return parsed.get();
            parsed.find('script').remove();
            return parsed.not('script').get();
        };
        $.extract = map => $.root().extract(map);
        $.merge = merge;
        $.load = load;
        $.flush = () => flush(state);
        $.dispose = () => {
            if (state.closed)
                return;
            state.wordLength = state.byteLength = 0;
            kernel.dispose(state.owner);
            state.owner = null;
            state.closed = true;
            state.words = state.payload = null;
            state.usedWords = state.usedPayload = null;
            state.callbackIds = null;
            state.wrappers.clear();
            state.data.clear();
            state.selectorAliases?.clear();
        };
        return $;
    }
    function contains(container, contained) {
        const a = nodes.get(container), b = nodes.get(contained);
        if (!a || !b)
            throw new TypeError('Expected GroveDOM node handles');
        alive(a.state);
        alive(b.state);
        if (a.state !== b.state)
            return false;
        for (let node = contained.parent; node; node = node.parent)
            if (node === container)
                return true;
        return false;
    }
    function merge(first, second) {
        const arrayLike = value => {
            if (Array.isArray(value) || selections.has(value))
                return true;
            if (value === null || typeof value !== 'object' || !Number.isSafeInteger(value.length) || value.length < 0)
                return false;
            for (let i = 0; i < value.length; i++)
                if (!(i in value))
                    return false;
            return true;
        };
        if (!arrayLike(first) || !arrayLike(second))
            return undefined;
        if (selections.has(first)) {
            const record = entry(first), added = inputIds(record.state, selections.has(second) ? second : Array.from(second));
            const ids = new Uint32Array(record.ids.length + added.length);
            ids.set(record.ids);
            ids.set(added, record.ids.length);
            record.ids = ids;
        }
        else {
            let length = first.length;
            const count = second.length;
            for (let i = 0; i < count; i++)
                first[length++] = second[i];
            first.length = length;
        }
        return first;
    }
    return { load, contains, merge };
}
