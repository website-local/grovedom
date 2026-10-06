import fs from 'node:fs';
import { fork, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { checkHost } from './host-load.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(value => { const [key, ...rest] = value.split('='); return [key.replace(/^--/, ''), rest.join('=')]; }));
if (!args.manifest)
    throw new Error('Use --manifest=FILE [--groups=1..3] [--warmups=1..100] [--iterations=1..8] [--out=FILE] [--busy=stop|pause|run] [--max-pauses=0..10]');
const manifest = JSON.parse(fs.readFileSync(args.manifest));
const groups = Number(args.groups ?? 1);
const warmups = Number(args.warmups ?? 20);
const iterations = Number(args.iterations ?? 1);
const busy = args.busy ?? 'stop';
if (!['stop', 'pause', 'run'].includes(busy))
    throw new Error('Expected --busy=stop, --busy=pause or --busy=run.');
const maxPauses = Number(args['max-pauses'] ?? (busy === 'pause' ? 3 : 0));
if (!Number.isInteger(maxPauses) || maxPauses < 0 || maxPauses > 10 || (busy !== 'pause' && maxPauses !== 0))
    throw new Error('Only --busy=pause accepts --max-pauses=0..10.');
if (!Number.isInteger(groups) || groups < 1 || groups > 3)
    throw new Error('Short screens allow one to three fixed groups.');
if (!Number.isInteger(warmups) || warmups < 1 || warmups > 100 ||
    !Number.isInteger(iterations) || iterations < 1 || iterations > 8)
    throw new Error('Short screens allow up to 100 warmups and eight replays per batch.');
const variants = manifest.variants, n = variants.length, reps = groups, blocks = n, results = [];
const pauses = [];
let expected, inputs, stopped = null;
const median = a => { if (!a.length)
    return null; const b = a.toSorted((x, y) => x - y); return (b[(b.length - 1) >> 1] + b[b.length >> 1]) / 2; };
function message(child) { return new Promise((resolve, reject) => { function end(code) { reject(Error('Child exited ' + code)); } child.once('exit', end); child.once('error', reject); child.once('message', m => { child.off('exit', end); child.off('error', reject); resolve(m); }); }); }
function pin(child, cpu) { const r = spawnSync('taskset', ['-pc', String(cpu), String(child.pid)], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
const comparisons = paired => variants.slice(1).map((v, i) => { const ratio = b => median(b.milliseconds[0]) / median(b.milliseconds[i + 1]), kept = paired.filter(b => b.accepted); return { candidate: v.name, raw: median(paired.map(ratio)), filtered: median(kept.map(ratio)) }; });
function report() {
    return { scope: 'Separate persistent implementation processes; synchronous complete preloaded replay including disposal. IPC, load checks, startup and warmups excluded. Two batches per sample; reported milliseconds per whole-corpus replay. Rotate and mirror all variants in each block; rotate/reverse imports.', settings: { groups, blocks, warmups, batches: 2, iterations, busy, maxPauses }, node: process.versions.node, variants: variants.map(v => v.name), corpus: inputs, hostPolicy: busy === 'pause'
        ? 'Before initialization and each block, check CPU/sibling activity once. On busy activity, park children and wait one second before rechecking, within a fixed whole-panel pause budget. Never execute a busy block or repeat a measured block. Stop incomplete when the budget is exhausted.'
        : busy === 'stop'
        ? 'Read inherited affinity through taskset. Before initialization and every paired block, sample CPU and sibling activity for one second; stop immediately above15%. No retries or replacement groups.'
        : 'Read inherited affinity through taskset. Before initialization and every paired block, sample CPU and sibling activity for one second; choose minimum sibling max/mean load. If above15%, retry twice after2seconds. Record every attempt; run and flag persistent load.', filterPolicy: 'Retain all raw samples; filter complete blocks only on independent probe max/min>1.5. No control normalization. A stopped panel is incomplete, not a passing screen.', results, pauses, stopped };
}
function save() {
    if (!args.out) return;
    // Preserve the preceding checkpoint if interrupted while writing the next.
    fs.writeFileSync(args.out + '.pending', JSON.stringify(report(), null, 2));
    fs.renameSync(args.out + '.pending', args.out);
}
async function hostCheck(location) {
    let host = await checkHost({ maxAttempts: busy === 'run' ? 3 : 1 });
    while (busy === 'pause' && !host.quiet && pauses.length < maxPauses) {
        // The decision uses only independent host activity. Completed samples
        // never affect the budget, ordering or whether this block is attempted.
        pauses.push({ ...location, host });
        save();
        console.error(JSON.stringify({ ...location, pause: pauses.length, maxPauses }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        host = await checkHost({ maxAttempts: 1 });
    }
    return host;
}
for (let replication = 0; replication < reps; replication++) {
    const children = [], samples = [], paired = [], initialHost = await hostCheck({ replication, stage: 'initial' });
    const group = { replication, initialHost, paired, samples, comparisons: [], complete: false };
    results.push(group);
    if (busy !== 'run' && !initialHost.quiet) {
        stopped = { replication, stage: 'initial', host: initialHost };
        break;
    }
    try {
        let imports = variants.map((_, i) => (i + replication) % n);
        if (replication % 2)
            imports.reverse();
        for (const index of imports) {
            const v = variants[index], env = { ...process.env, ...v.env, GROVEDOM_PROCESS_ENTRY: pathToFileURL(v.entry).href, GROVEDOM_REPLAY_ENTRY: v.entry, GROVEDOM_PROCESS_FIXTURE: pathToFileURL(manifest.workload ?? process.cwd() + '/test/fixtures.mjs').href, GROVEDOM_PROCESS_CONFIG: JSON.stringify({ rows: 120, batches: 2, iterations, warmups, consumer: manifest.consumer, corpus: manifest.corpus, options: v.options }) };
            const child = fork(new URL('./window-child.mjs', import.meta.url), [], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
            children[index] = child;
            child.stderr.on('data', b => process.stderr.write(b));
            const ready = message(child);
            pin(child, initialHost.chosen.cpu);
            let report = await ready;
            if (report.kind === 'loaded') {
                const warmed = message(child);
                child.send('warmup');
                report = await warmed;
            }
            assert.equal(report.kind, 'ready');
            expected ??= report.expected;
            inputs ??= report.corpus;
            assert.deepEqual(report.expected, expected);
            assert.deepEqual(report.corpus, inputs);
        }
        for (let block = 0; block < blocks; block++) {
            // All benchmark children are parked before checking load. Choose by independent
            // CPU/sibling activity, never by a candidate time. Pin every child to one CPU.
            const host = await hostCheck({ replication, block, stage: 'block' });
            if (busy !== 'run' && !host.quiet) {
                stopped = { replication, block, stage: 'block', host };
                break;
            }
            for (const child of children)
                pin(child, host.chosen.cpu);
            const forward = variants.map((_, i) => (i + block + replication) % n), order = [...forward, ...forward.toReversed()], milliseconds = variants.map(() => []), probes = [];
            for (const index of order) {
                const pending = message(children[index]);
                children[index].send('sample');
                const r = await pending;
                assert.equal(r.kind, 'sample');
                const ms = median(r.samples);
                milliseconds[index].push(ms);
                probes.push(...r.controls.flat());
                samples.push({ block, variant: variants[index].name, medianMilliseconds: ms, ...r });
            }
            paired.push({ order, milliseconds, host, accepted: Math.max(...probes) / Math.min(...probes) <= 1.5 });
            group.comparisons = comparisons(paired);
            save();
            console.error(JSON.stringify({ replication, block, preflightQuiet: host.quiet, siblingBusy: host.chosen.siblingMax, probeAccepted: paired.at(-1).accepted }));
        }
        group.complete = paired.length === blocks;
    }
    finally {
        await Promise.all(children.filter(Boolean).map(child => new Promise(resolve => { child.once('exit', resolve); if (child.exitCode !== null)
            resolve();
        else if (child.connected)
            child.send('stop');
        else
            child.kill(); })));
    }
    save();
    if (stopped) break;
}
save();
console.log(JSON.stringify(report(), null, 2));
if (stopped) process.exitCode = 2;
