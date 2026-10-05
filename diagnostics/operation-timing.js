// Synchronous domain accounting for diagnostics. Callback time is suspended;
// nested DOM calls from a callback are charged to DOM again, exactly once.
export function operationTiming(now = () => performance.now()) {
    let domain = null, started = 0;
    const totals = new Map();
    function enter(next) {
        const time = now();
        if (domain !== null) totals.set(domain, (totals.get(domain) ?? 0) + time - started);
        domain = next; started = time;
    }
    return {
        run(next, fn, receiver, args) {
            if (next === domain) return Reflect.apply(fn, receiver, args);
            const previous = domain;
            enter(next);
            try { return Reflect.apply(fn, receiver, args); }
            finally { enter(previous); }
        },
        reset() {
            if (domain !== null) throw new Error('Reset timing outside measured calls.');
            totals.clear();
        },
        snapshot() {
            if (domain !== null) throw new Error('Read timing outside measured calls.');
            return Object.fromEntries(totals);
        },
    };
}

export function timeFunctions(object, timing, domain) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(object))) {
        if (key === 'constructor' || typeof descriptor.value !== 'function' || descriptor.value === object) continue;
        const fn = descriptor.value;
        Object.defineProperty(object, key, { ...descriptor,
            value: function (...args) { return timing.run(domain, fn, this, args); } });
    }
}

export function timeFacade(load, timing) {
    const prototypes = new WeakSet(), callbacks = new WeakMap();
    const callbackAt = { each: 0, map: 0, filter: 0, not: 0, is: 0,
        attr: 1, prop: 1, css: 1, text: 0, html: 0, val: 0,
        addClass: 0, removeClass: 0, toggleClass: 0, wrap: 0, wrapAll: 0, wrapInner: 0 };
    const content = new Set(['append', 'prepend', 'before', 'after', 'replaceWith']);
    function callback(fn) {
        if (!callbacks.has(fn)) callbacks.set(fn, function (...args) { return timing.run(null, fn, this, args); });
        return callbacks.get(fn);
    }
    function wrap(fn, name, receiver) {
        return function (...args) {
            if (Object.hasOwn(callbackAt, name)) {
                const at = callbackAt[name];
                if (typeof args[at] === 'function') args[at] = callback(args[at]);
            } else if (content.has(name)) args = args.map(value => typeof value === 'function' ? callback(value) : value);
            return timing.run('dom', fn, receiver ?? this, args);
        };
    }
    return function (...args) {
        return timing.run('dom', () => {
            const api = load(...args), prototype = api.prototype;
            if (!prototypes.has(prototype)) {
                prototypes.add(prototype);
                for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype)))
                    if (name !== 'constructor' && typeof descriptor.value === 'function')
                        Object.defineProperty(prototype, name, { ...descriptor, value: wrap(descriptor.value, name) });
            }
            const functions = new Map();
            return new Proxy(api, {
                apply(target, receiver, args) { return timing.run('dom', target, receiver, args); },
                get(target, key, receiver) {
                    const value = Reflect.get(target, key, receiver);
                    if (typeof value !== 'function') return value;
                    // The engine may replace load/dispose; cache by current value.
                    if (functions.get(key)?.source !== value) functions.set(key, { source: value, wrapper: wrap(value, key, api) });
                    return functions.get(key).wrapper;
                },
            });
        }, undefined, []);
    };
}
