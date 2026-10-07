// Authored synthetic inputs; no downloaded pages or private consumer content.
export const documents = [
  '<!doctype html><title>Example &amp; entities</title><main><p>Hello <b>world</b>!</p><input disabled><br></main>',
  '<table>before<tr><td>A<td>B</table><p><b>one<i>two</b>three</i>',
  '<div data-x="🪴 &quot; q">汉字 &lt; &gt; &nbsp;<!-- comment --><script>if (a < b) x++;</script></div>',
  '<svg viewBox="0 0 10 10"><use xlink:href="#icon"></use><text>label</text></svg>',
  '<noscript><p>fallback</p></noscript><textarea>&lt;strong&gt;</textarea>',
];

export { page, replay } from '../demo/workload.js';
