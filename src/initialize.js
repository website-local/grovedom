// Initialization is scoped to one package entry and one JavaScript environment.
export function validateOptions(options, keys) {
    if (!options || typeof options !== 'object' || Array.isArray(options))
        throw new TypeError('Expected initialization options');
    for (const key of Object.keys(options)) {
        if (!keys.includes(key))
            throw new TypeError(`Unknown initialization option: ${key}`);
    }
    if (options.heap !== undefined && !['pool', 'global', 'document'].includes(options.heap))
        throw new TypeError('Expected pool, global, or document heap');
    for (const key of ['poolSize', 'poolMaxBytes']) {
        if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || options[key] < 0))
            throw new TypeError(`Expected nonnegative integer ${key}`);
    }
}
export function initializedError() {
    return new Error('GroveDOM is already initialized; configure it before any DOM calls.');
}
