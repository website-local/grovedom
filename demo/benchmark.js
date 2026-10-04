import { init, load } from '../grovedom/src/browser.js';

const run = document.querySelector('#run');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
function page(rows) {
  return '<html><head><title>Demo</title></head><body><main>' + Array.from({ length: rows }, (_, i) =>
    `<article><h2>Item ${i}</h2><a href="/item/${i}">Link</a><p class="remove">Discard</p></article>`).join('') + '</main></body></html>';
}
function grove(source) {
  const $ = load(source);
  try {
    $('article').each(function (i) { $(this).attr('data-index', String(i)); });
    $('h2').text((i, text) => text + ' updated');
    $('a').attr('target', '_blank');
    $('.remove').remove();
    return $.html();
  } finally { $.dispose(); }
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
  await init();
  status.textContent = 'Ready. Initialization is complete; DOM operations are synchronous.';
  run.disabled = false;
} catch (error) {
  status.textContent = `This browser could not initialize GroveDOM: ${error.message}`;
}
run.addEventListener('click', async () => {
  run.disabled = true;
  try {
    const source = page(Number(document.querySelector('#rows').value));
    if (grove(source) !== browser(source)) throw new Error('Output mismatch; timing cancelled.');
    for (let i = 0; i < 3; i++) { grove(source); browser(source); await yieldToBrowser(); }
    const samples = [];
    status.textContent = 'Running three short pairs…';
    for (let block = 0; block < 3; block++) {
      const sample = { block: block + 1 };
      for (const name of block % 2 ? ['browser', 'grovedom'] : ['grovedom', 'browser']) {
        await yieldToBrowser();
        const start = performance.now();
        const output = (name === 'grovedom' ? grove : browser)(source);
        sample[name] = performance.now() - start;
        sample.outputCharacters = output.length;
      }
      samples.push(sample);
    }
    results.textContent = samples.map(s => `Pair ${s.block}: GroveDOM ${s.grovedom.toFixed(2)} ms; browser DOM ${s.browser.toFixed(2)} ms; ratio ${(s.browser / s.grovedom).toFixed(2)}×`).join('\n');
    status.textContent = 'Complete. Outputs matched. Ratios above one favor GroveDOM.';
  } catch (error) { status.textContent = error.message; }
  finally { run.disabled = false; }
});
