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
for (let i = 0; i < config.warmups; i++)
    consumed += config.consumer ? await invoke() : invoke();
let probeSink = 0;
function probe() {
    const start = performance.now();
    for (let i = 0; i < 3000000; i++)
        probeSink = (Math.imul(probeSink ^ i, 1664525) + 1013904223) | 0;
    return performance.now() - start;
}
for (let i = 0; i < 30; i++)
    probe();
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
process.send({ kind: 'ready', expected, corpus });
process.on('message', async (m) => { if (m === 'stop') {
    process.exit(0);
} if (m === 'sample')
    process.send({ kind: 'sample', ...await measure() }); });
