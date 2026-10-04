import { performance } from 'node:perf_hooks';
export function instrument(base, { queryDetails = false, allocationDetails = false } = {}) {
    const rows = new Map(), kernel = {};
    const observed = new Set(['create', 'createXML', 'dispose', 'query', 'read', 'observe', 'traverse', 'edit', 'execute']);
    for (const name of Object.getOwnPropertyNames(base)) {
        if (!observed.has(name)) {
            kernel[name] = base[name];
            continue;
        }
        kernel[name] = (...args) => {
            const key = name === 'read' || name === 'observe' || name === 'edit' || (queryDetails && name === 'query') ? `${name}:${args[1]}` : name;
            let row = rows.get(key);
            if (!row) {
                row = { calls: 0, milliseconds: 0, inputCharacters: 0, resultCharacters: 0 };
                rows.set(key, row);
            }
            row.calls++;
            const input = name === 'create' || name === 'createXML' ? args[0] : name === 'query' ? args[1] : name === 'read' || name === 'observe' ? args[3] : name === 'edit' ? args[4] : null;
            if (typeof input === 'string')
                row.inputCharacters += input.length;
            const before = allocationDetails ? base.stats() : null;
            const start = performance.now();
            try {
                const result = base[name](...args);
                if (typeof result === 'string')
                    row.resultCharacters += result.length;
                if (result instanceof Uint32Array) {
                    row.resultItems = (row.resultItems ?? 0) + result.length;
                    if (!result.length)
                        row.emptyResults = (row.emptyResults ?? 0) + 1;
                }
                return result;
            }
            finally {
                row.milliseconds += performance.now() - start;
                if (before) {
                    const after = base.stats();
                    row.allocationRequests = (row.allocationRequests ?? 0) + after.allocations - before.allocations;
                    row.liveByteDelta = (row.liveByteDelta ?? 0) + after.liveBytes - before.liveBytes;
                }
            }
        };
    }
    return { kernel, reset() { rows.clear(); }, snapshot() { return Object.fromEntries(Array.from(rows, ([key, row]) => [key, { ...row }])); } };
}
