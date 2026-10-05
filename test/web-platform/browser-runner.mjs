import { selectorCases, selectorResult, escapeResult } from './runner.mjs';
import { domCases } from './dom-cases.mjs';

// Reuse exactly the Node suite's inputs and fixed expectations. A resolved TODO
// is an unexpected pass and requires review, never a silent exemption.
export function runBrowserCases(load, fixture, selectors, escapes, report = () => {}) {
  const counts = { pass: 0, fail: 0, skip: 0, todo: 0 };
  function check(name, run, expected, row = {}) {
    let status = 'pass', detail = '';
    if (row.skip) { status = 'skip'; detail = row.skip; }
    else {
      try {
        const actual = run();
        if (row.todo) throw new Error('Known selector limitation changed; review and remove the TODO.');
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error(`Expected ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
      } catch (error) {
        status = row.todo && error.code === 'ERR_GROVEDOM_SELECTOR' ? 'todo' : 'fail';
        detail = status === 'todo' ? row.todo : error.message;
      }
    }
    counts[status]++; report({ name, status, detail });
  }
  for (const { row, context, name } of selectorCases(selectors))
    check(name, () => selectorResult(load, fixture, row, context), { ids: row.expected, stable: true, unique: true }, row);
  for (const row of escapes)
    check(`WPT escape ${JSON.stringify(row.id)}: ${row.selector}`, () => escapeResult(load, row), { count: Number(row.matches), identity: true }, row);
  for (const execution of ['buffered', 'direct']) for (const row of domCases)
    check(`${execution}: ${row.name}`, () => row.run((source, options, document) => load(source, { ...options, execution }, document)), row.expected);
  return counts;
}
