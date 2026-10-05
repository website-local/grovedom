import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function page(rows = 80) {
    return '<main>' + Array.from({ length: rows }, (_, i) =>
        `<article id="a${i}"><p class="body">text${i}</p><a href="/${i}">link</a></article>`).join('') + '</main>';
}

// Compare public API strategies for identical markup inserted into many targets.
// This is an authored workload, not a proposed change to insertion semantics.
export function replay(load, source, strategy = 'parse') {
    assert(['parse', 'clone'].includes(strategy));
    const $ = load(source);
    const content = markup => strategy === 'clone' ? $(markup) : markup;
    try {
        $('article').append(content('<i class="added">é</i>'));
        $('article').prepend(content('<header>heading</header>'));
        $('p').before(content('<b>before</b>')).after(content('<em>after</em>'));
        $('a').attr('href', (_, value) => value + '?changed');
        return $.html();
    } finally { $.dispose?.(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const { load } = await import('../diagnostics/index.js');
    const { kernel } = await import('../diagnostics/kernel.js');
    const { load: cheerio } = await import('cheerio');
    assert.equal(typeof kernel.profile, 'function', 'Build native with GROVEDOM_PROFILE=1 and select GROVEDOM_BACKEND=napi.');
    assert('fragmentParse' in kernel.profile(), 'Rebuild diagnostics to include fragment counters.');
    const source = page(), expected = replay(cheerio, source), reports = [];
    assert.equal(replay(cheerio, source, 'clone'), expected);
    for (const strategy of ['parse', 'clone']) {
        for (let i = 0; i < 20; i++) assert.equal(replay(load, source, strategy), expected);
        kernel.profileReset();
        for (let i = 0; i < 10; i++) assert.equal(replay(load, source, strategy), expected);
        const phases = kernel.profile(), stats = kernel.stats();
        assert.equal(stats.liveDocuments, 0);
        assert.equal(stats.liveBytes, 0);
        reports.push({ strategy, replays: 10, phases, stats });
    }
    console.log(JSON.stringify({
        scope: 'Fixed native instrumented diagnostic; timers perturb execution. Independent strategy times are not speedup evidence.',
        rows: 80, columns: ['calls', 'inclusiveNs', 'exclusiveNs', 'referenceTscTicks', 'units'], reports,
    }, null, 2));
}
