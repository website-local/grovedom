import { init, load } from '../grovedom/src/browser.js';

const run = document.querySelector('#run');
const status = document.querySelector('#status');
const cheerioStatus = document.querySelector('#cheerio-status');
const results = document.querySelector('#results');
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
let cheerioLoad;
async function optionalCheerio() {
  let timeout;
  try {
    const api = await Promise.race([
      import('https://cdn.jsdelivr.net/npm/cheerio@1.2.0/+esm'),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('CDN loading timed out')), 10000); }),
    ]);
    if (typeof api.load !== 'function') throw new Error('CDN module has no load function');
    cheerioStatus.textContent = 'Cheerio 1.2.0 is ready (default parser). CDN loading is excluded from timing.';
    return api.load;
  } catch (error) {
    cheerioStatus.textContent = `Cheerio unavailable: ${error.message}. The DOMParser comparison is still available.`;
    return undefined;
  } finally { clearTimeout(timeout); }
}
function page(rows) {
  return '<html><head><title>Demo</title></head><body><main>' + Array.from({ length: rows }, (_, i) =>
    `<article><h2>Item ${i}</h2><a href="/item/${i}">Link</a><p class="remove">Discard</p></article>`).join('') + '</main></body></html>';
}
function transform(open, source) {
  const $ = open(source);
  try {
    $('article').each(function (i) { $(this).attr('data-index', String(i)); });
    $('h2').text((i, text) => text + ' updated');
    $('a').attr('target', '_blank');
    $('.remove').remove();
    return $.html();
  } finally { $.dispose?.(); }
}
function browser(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('article').forEach((node, i) => node.setAttribute('data-index', String(i)));
  doc.querySelectorAll('h2').forEach(node => { node.textContent += ' updated'; });
  doc.querySelectorAll('a').forEach(node => node.setAttribute('target', '_blank'));
  doc.querySelectorAll('.remove').forEach(node => node.remove());
  return doc.documentElement.outerHTML;
}
try {
  [, cheerioLoad] = await Promise.all([init(), optionalCheerio()]);
  status.textContent = 'Ready. Initialization is complete; DOM operations are synchronous.';
  run.disabled = false;
} catch (error) {
  status.textContent = `This browser could not initialize GroveDOM: ${error.message}`;
}
run.addEventListener('click', async () => {
  run.disabled = true;
  results.textContent = '';
  try {
    const source = page(Number(document.querySelector('#rows').value));
    const variants = [
      { name: 'GroveDOM', replay: source => transform(load, source) },
      ...(cheerioLoad ? [{ name: 'Cheerio 1.2.0', replay: source => transform(cheerioLoad, source) }] : []),
      { name: 'DOMParser', replay: browser },
    ];
    const expected = browser(source);
    for (const variant of variants)
      if (variant.replay(source) !== expected) throw new Error(`${variant.name} output mismatch; timing cancelled.`);
    for (let i = 0; i < 3; i++) {
      for (const variant of variants) { variant.replay(source); await yieldToBrowser(); }
    }
    const samples = [];
    status.textContent = 'Running three short rounds…';
    for (let block = 0; block < 3; block++) {
      const sample = { block: block + 1, times: {} };
      const order = variants.map((_, i) => variants[(i + block) % variants.length]);
      for (const variant of order) {
        await yieldToBrowser();
        const start = performance.now();
        const output = variant.replay(source);
        sample.times[variant.name] = performance.now() - start;
        if (output !== expected) throw new Error(`${variant.name} output changed during timing.`);
      }
      samples.push(sample);
    }
    results.textContent = samples.map(sample => {
      const times = variants.map(v => `${v.name} ${sample.times[v.name].toFixed(2)} ms`).join('; ');
      const ratios = variants.slice(1).map(v => `${v.name}/GroveDOM ${(sample.times[v.name] / sample.times.GroveDOM).toFixed(2)}×`).join('; ');
      return `Round ${sample.block}: ${times}\n  ${ratios}`;
    }).join('\n');
    status.textContent = 'Complete. Outputs matched. Ratios above one favor GroveDOM.';
  } catch (error) { status.textContent = error.message; }
  finally { run.disabled = false; }
});
