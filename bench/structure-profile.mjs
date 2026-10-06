// Operation counts for shapes that ordinary consumer sampling can miss.
// Setup, output comparison and disposal are outside the counted operation.
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load, measurement } from '../diagnostics/instrumented.js';
import { kernel } from '../diagnostics/kernel.js';

const shapes = {
    childEdges(load, size) {
        const $ = load('<main>' + Array.from({ length: size }, (_, i) => `<i data-i="${i}"></i>`).join('') + '</main>');
        const node = $('main')[0];
        return { $, run: () => [node.firstChild, node.lastChild], output: nodes => nodes.map(n => n.attribs['data-i']) };
    },
    contains(load, size) {
        const $ = load('<main>' + '<div>'.repeat(size) + '<b></b>' + '</div>'.repeat(size) + '</main>');
        const root = $('main')[0], leaf = $('b')[0];
        return { $, run: () => $.contains(root, leaf) };
    },
    overlappingFind(load, size) {
        const $ = load('<main>' + '<div>'.repeat(size) + '<b></b>' + '</div>'.repeat(size) + '</main>');
        const roots = $($('div').get().reverse());
        return { $, run: () => roots.find('b'), output: nodes => nodes.length };
    },
    siblingUntil(load, size) {
        const $ = load('<main>' + Array.from({ length: size }, (_, i) => `<i data-i="${i}"></i>`).join('') + '</main>');
        const nodes = $('i');
        return { $, run: () => nodes.nextUntil('.stop'), output: nodes => nodes.get().map(n => n.attribs['data-i']) };
    },
    attributeObject(load, size) {
        const $ = load('<i data-value="' + 'x'.repeat(size) + '"></i>');
        const node = $('i');
        return { $, run: () => node.attr(), output: attributes => Object.entries(attributes) };
    },
    attributeEntries(load, size) {
        const $ = load('<i ' + Array.from({ length: size }, (_, i) => `data-${i}="x"`).join(' ') + '></i>');
        const node = $('i')[0];
        return { $, run: () => Object.entries(node.attribs) };
    },
};

const reports = [];
for (const [shape, setup] of Object.entries(shapes)) {
    const sizes = shape === 'attributeObject' ? [16, 256, 4096]
        : shape === 'siblingUntil' || shape === 'attributeEntries' ? [8, 32, 128] : [16, 64, 256];
    for (const size of sizes) {
        const reference = setup(cheerio, size), candidate = setup(load, size);
        try {
            const expected = reference.run();
            measurement.reset();
            kernel.profileReset?.();
            const actual = candidate.run();
            const calls = Object.fromEntries(Object.entries(measurement.snapshot()).map(([name, row]) => {
                const { milliseconds, ...counts } = row;
                return [name, counts];
            }));
            const units = kernel.profile ? Object.fromEntries(Object.entries(kernel.profile())
                .filter(([, row]) => row[4]).map(([name, row]) => [name, row[4]])) : undefined;
            assert.deepEqual(candidate.output ? candidate.output(actual) : actual,
                reference.output ? reference.output(expected) : expected, `${shape}/${size}`);
            reports.push({ shape, size, calls, units });
        } finally {
            candidate.$.dispose();
        }
        assert.equal(kernel.stats().liveDocuments, 0);
        assert.equal(kernel.stats().liveBytes, 0);
    }
}
console.log(JSON.stringify({
    scope: 'Authored scaling diagnostic, checked against Cheerio. Counts describe boundary work, not elapsed speed or individual allocations. Optional macro-guarded native counters describe work inside the kernel. No production workload weighting.',
    reports,
}, null, 2));
