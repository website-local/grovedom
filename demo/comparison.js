import { cases, page, transform } from './workload.js';

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function createProbe(now) {
  let sink = 0;
  return () => {
    let value = sink;
    const start = now();
    for (let i = 0; i < 3000000; i++) value = (Math.imul(value ^ i, 1664525) + 1013904223) | 0;
    sink = value;
    return now() - start;
  };
}
export function summarize(blocks) {
  const complete = blocks.filter(b => b.complete);
  const kept = complete.filter(b => b.accepted);
  const stats = rows => ({ blocks: rows.length, pairedSpeedup: median(rows.map(b => b.speedup)),
    milliseconds: [0, 1].map(i => median(rows.map(b => median(b.milliseconds[i])))) });
  return { raw: stats(complete), filtered: stats(kept),
    byOrder: Object.fromEntries(['ABBA/BAAB', 'BAAB/ABBA'].map(order => [order, stats(complete.filter(b => b.order === order))])) };
}
// The balanced opposite-order halves and probe-only filter match bench/short.mjs.
// A is current Wasm; B is the reference. Ratios B/A > 1 favor current Wasm.
export async function compare(variants, { durationMs, now = () => performance.now(),
  yieldControl = async () => {}, selectedCases = cases, warmups = 20, iterations = 2,
  probe = createProbe(now) } = {}) {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) throw new Error('Positive finite duration required');
  if (variants.length < 2 || new Set(variants.map(v => v.name)).size !== variants.length)
    throw new Error('At least two uniquely named variants required');
  if (![warmups, iterations].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Positive counts required');
  const start = now(), deadline = start + durationMs;
  const inputs = selectedCases.map(c => ({ ...c, source: page(c.rows) }));
  for (const input of inputs) {
    input.expected = transform(variants[0].load, input.source);
    for (let i = 0; i < warmups; i++) for (const variant of variants) {
      if (now() >= deadline) throw new Error('Budget exhausted during warmup');
      if (transform(variant.load, input.source) !== input.expected)
        throw new Error(`${variant.name}: ${input.id} output mismatch; timing cancelled`);
      await yieldControl();
    }
  }
  // Warm the independent CPU probe as in the local short paired harness.
  for (let i = 0; i < 30; i++) { if (now() >= deadline) throw new Error('Budget exhausted during probe warmup'); probe(); }
  const panels = inputs.flatMap(input => variants.slice(1).map(reference => ({
    input, reference, blocks: [],
  })));
  let round = 0, stopped = false;
  while (!stopped && now() < deadline) {
    for (let p = 0; p < panels.length; p++) {
      const panel = panels[(p + round) % panels.length];
      const pair = [variants[0], panel.reference], milliseconds = [[], []], probes = [];
      const block = { round, order: round % 2 ? 'BAAB/ABBA' : 'ABBA/BAAB', milliseconds, probes, complete: false, accepted: false };
      for (let half = 0; half < 2 && !stopped; half++) {
        await yieldControl();
        if (now() >= deadline) { stopped = true; break; }
        probes.push(probe());
        const order = (round + half) % 2 ? [1, 0, 0, 1] : [0, 1, 1, 0];
        for (const index of order) {
          if (now() >= deadline) { stopped = true; break; }
          const outputs = [];
          const begin = now();
          for (let i = 0; i < iterations; i++) outputs.push(transform(pair[index].load, panel.input.source));
          milliseconds[index].push((now() - begin) / iterations);
          if (outputs.some(output => output !== panel.input.expected))
            throw new Error(`${pair[index].name}: ${panel.input.id} output changed during timing`);
          probes.push(probe());
        }
      }
      block.complete = milliseconds.every(values => values.length === 4);
      if (block.complete) {
        block.probeSpread = Math.max(...probes) / Math.min(...probes);
        block.accepted = Number.isFinite(block.probeSpread) && block.probeSpread <= 1.5;
        const sum = values => values.reduce((a, b) => a + b, 0);
        block.speedup = sum(milliseconds[1]) / sum(milliseconds[0]);
      }
      panel.blocks.push(block);
      if (stopped) break;
    }
    if (!stopped) round++;
  }
  const results = panels.map(({ input, reference, blocks }) => ({ case: input.id,
    reference: reference.name, control: Boolean(reference.control), ...summarize(blocks), blocks }));
  return { elapsedMs: now() - start, completeRounds: round,
    sufficient: results.every(r => r.raw.blocks >= 3),
    settings: { warmups, iterations, maximumProbeSpread: 1.5, order: 'ABBA/BAAB alternating with BAAB/ABBA' },
    results };
}
