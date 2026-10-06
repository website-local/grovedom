import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const facade = await import(process.env.GROVEDOM_PROCESS_ENTRY);
const { load } = facade;
const config = JSON.parse(process.env.GROVEDOM_PROCESS_CONFIG);
if (config.options !== undefined) await facade.init(config.options);
const inputs = [];
for (const item of config.corpus) {
    const { page, replay } = await import(item.workload ? pathToFileURL(item.workload).href : process.env.GROVEDOM_PROCESS_FIXTURE);
    const source = item.path ? readFileSync(item.path, 'utf8') : page(item.rows ?? config.rows);
    inputs.push({ source, replay, scenario: item });
}
const corpus = inputs.map(({ source, scenario }) => ({ id: scenario.id,
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }));
const expected = [];
for (const { source, replay, scenario } of inputs)
    expected.push(config.consumer ? await replay(source, scenario) : replay(load, source));
const invoke = config.consumer ? async () => {
    let length = 0;
    for (const { source, replay, scenario } of inputs)
        length += (await replay(source, scenario)).length;
    return length;
} : () => {
    let length = 0;
    for (const { source, replay } of inputs)
        length += replay(load, source).length;
    return length;
};
let consumed = 0;
let probeSink = 0;
function probeWork() {
    let value = probeSink;
    for (let i = 0; i < 3000000; i++)
        value = (Math.imul(value ^ i, 1664525) + 1013904223) | 0;
    probeSink = value;
}
function probe() {
    // Keep clock/property accesses outside the loop's OSR compilation. Their
    // cold exit feedback otherwise causes repeated deoptimization of the probe.
    const start = performance.now();
    probeWork();
    return performance.now() - start;
}
async function warmup() {
    // Warm from the IPC handler and through the same event-loop boundaries as
    // sampling. Otherwise the first sample changes async-hook resource shapes.
    for (let i = 0; i < config.warmups; i++) {
        await new Promise(setImmediate);
        consumed += config.consumer ? await invoke() : invoke();
    }
    for (let i = 0; i < 30; i++) probe();
}
async function measure() {
    const samples = [], controls = [];
    for (let batch = 0; batch < config.batches; batch++) {
        await new Promise(setImmediate);
        const before = probe();
        const start = performance.now();
        for (let i = 0; i < config.iterations; i++)
            consumed += config.consumer ? await invoke() : invoke();
        samples.push((performance.now() - start) / config.iterations);
        controls.push([before, probe()]);
    }
    return { samples, controls, consumed, probeSink };
}
process.send({ kind: 'loaded' });
process.on('message', async (m) => { if (m === 'stop') {
    process.exit(0);
} if (m === 'warmup') {
    await warmup();
    process.send({ kind: 'ready', expected, corpus });
} if (m === 'sample')
    process.send({ kind: 'sample', ...await measure() }); });
