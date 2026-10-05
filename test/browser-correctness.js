import { init, load } from '../src/browser.js';
import { runBrowserCases } from './web-platform/browser-runner.mjs';

const status = document.querySelector('#status'), results = document.querySelector('#results');
const parameters = new URL(location.href).searchParams;
async function read(name, json = false) {
  const response = await fetch(new URL('./web-platform/' + name, import.meta.url));
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
try {
  const wasm = new URL(parameters.get('wasm') ?? '../build/wasm/grovedom.wasm', location.href);
  const [, fixture, selectors, escapes] = await Promise.all([
    init({ wasm }), read('selectors.html'), read('selectors.json', true), read('escapes.json', true),
  ]);
  status.textContent = 'Running correctness cases…';
  await new Promise(resolve => setTimeout(resolve, 0));
  const details = [];
  const counts = runBrowserCases(load, fixture, selectors, escapes, result => {
    if (result.status !== 'pass') details.push(`${result.status.toUpperCase()}: ${result.name}\n${result.detail}`);
  });
  status.textContent = `${counts.pass} passed; ${counts.fail} failed; ${counts.skip} skipped; ${counts.todo} known failures.`;
  status.dataset.result = counts.fail ? 'fail' : 'pass';
  results.textContent = details.join('\n\n');
} catch (error) {
  status.textContent = 'Correctness checks could not complete.';
  status.dataset.result = 'fail';
  results.textContent = error.message;
}
