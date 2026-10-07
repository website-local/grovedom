import { init, load } from '../grovedom/src/browser.js';
import { init as initControl, load as controlLoad } from '../grovedom/src/browser.js?paired-control';
import { compare } from './comparison.js';

const run = document.querySelector('#run');
const status = document.querySelector('#status');
const cheerioStatus = document.querySelector('#cheerio-status');
const results = document.querySelector('#results');
const download = document.querySelector('#download');
let reportURL;
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
let references;
async function loadCheerio() {
  let timeout;
  try {
    const [defaultApi, slimApi] = await Promise.race([
      Promise.all([
        import('https://cdn.jsdelivr.net/npm/cheerio@1.2.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/cheerio@1.2.0/dist/esm/slim.js/+esm'),
      ]),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('CDN loading timed out')), 10000); }),
    ]);
    if (typeof defaultApi.load !== 'function' || typeof slimApi.load !== 'function')
      throw new Error('CDN module has no load function');
    cheerioStatus.textContent = 'Cheerio 1.2.0 is ready (default and htmlparser2 parsers).';
    return [{ name: 'Cheerio default', load: defaultApi.load }, { name: 'Cheerio htmlparser2', load: slimApi.load }];
  } finally { clearTimeout(timeout); }
}
try {
  [, , references] = await Promise.all([init({ heap: 'pool' }), initControl({ heap: 'pool' }), loadCheerio()]);
  status.textContent = 'Ready. HTML, XML sitemap and SVG cases match CI.';
  run.disabled = false;
} catch (error) {
  status.textContent = `Comparison unavailable: ${error.message}. Reload to retry.`;
  cheerioStatus.textContent = 'The comparison requires Wasm and both Cheerio parsers to load.';
}
run.addEventListener('click', async () => {
  run.disabled = true;
  results.textContent = '';
  download.hidden = true;
  if (reportURL) URL.revokeObjectURL(reportURL);
  status.textContent = 'Running all four cases for about thirty seconds…';
  try {
    await yieldToBrowser();
    const report = await compare([{ name: 'GroveDOM Wasm', load }, ...references,
      { name: 'identical Wasm control', load: controlLoad, control: true }],
      { durationMs: 30000, yieldControl: yieldToBrowser });
    results.textContent = report.results.map(row =>
      `${row.case}: ${row.reference}/GroveDOM\n  Paired raw ${row.raw.pairedSpeedup?.toFixed(2) ?? 'n/a'}×; probe-filtered ${row.filtered.pairedSpeedup?.toFixed(2) ?? 'n/a'}× (${row.filtered.blocks}/${row.raw.blocks} blocks retained)`
    ).join('\n\n');
    reportURL = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    download.href = reportURL;
    download.download = 'grovedom-paired-benchmark.json';
    download.hidden = false;
    status.textContent = report.sufficient
      ? 'Complete. All outputs matched. Ratios above one favor GroveDOM.'
      : 'Outputs matched, but fewer than three complete paired blocks per comparison fit. Results are insufficient; retry with this tab active.';
  } catch (error) { status.textContent = error.message; }
  finally { run.disabled = false; }
});
