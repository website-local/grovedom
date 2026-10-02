import { performance } from 'node:perf_hooks';
export function instrument(base) {
  const rows = new Map(), kernel = {};
  const observed = new Set(['create', 'dispose', 'query', 'read', 'observe', 'traverse', 'edit', 'execute']);
  for (const name of Object.getOwnPropertyNames(base)) {
    if (!observed.has(name)) { kernel[name] = base[name]; continue; }
    kernel[name] = (...args) => {
      const key = name === 'read' || name === 'observe' || name === 'edit' ? `${name}:${args[1]}` : name;
      let row = rows.get(key);
      if (!row) { row = { calls: 0, milliseconds: 0, inputCharacters: 0, resultCharacters: 0 }; rows.set(key, row); }
      row.calls++;
      const input = name === 'create' ? args[0] : name === 'query' ? args[1] : name === 'read' || name === 'observe' ? args[3] : name === 'edit' ? args[4] : null;
      if (typeof input === 'string') row.inputCharacters += input.length;
      const start = performance.now();
      try {
        const result = base[name](...args);
        if (typeof result === 'string') row.resultCharacters += result.length;
        return result;
      } finally { row.milliseconds += performance.now() - start; }
    };
  }
  return { kernel, reset() { rows.clear(); }, snapshot() { return Object.fromEntries(rows); } };
}
