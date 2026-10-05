// Input families and root/child assertions adapted from Cheerio 1.2.0's
// src/parse.spec.ts (MIT, test/upstream/cheerio-LICENSE). Expected trees here
// are fixed, and checked through the public DOM facade rather than getParse().
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';

const fixtures = [
  ['empty element', '<div></div>', [['tag', 'div', []]]],
  ['siblings', '<h2></h2><p></p>', [['tag', 'h2', []], ['tag', 'p', []]]],
  ['void element', '<br/>', [['tag', 'br', []]]],
  ['text child', '<li class="durian">Durian</li>', [['tag', 'li', [['text', 'Durian']]]]],
  ['comment', '<!-- retained -->', [['comment', ' retained ']]],
  ['text', 'lorem ipsum', [['text', 'lorem ipsum']]],
  ['script data', '<script>if(a<b)c="&amp;";</script>', [['script', 'script', [['text', 'if(a<b)c="&amp;";']]]]],
  ['style data', '<style>p:before{content:"&amp;"}</style>', [['style', 'style', [['text', 'p:before{content:"&amp;"}']]]]],
  ['empty script', '<script></script>', [['script', 'script', []]]],
  ['empty style', '<style></style>', [['style', 'style', []]]],
  ['RCDATA', '<textarea>&lt;b&gt;&amp;</textarea>', [['tag', 'textarea', [['text', '<b>&']]]]],
  ['character references', '<p>&#x1f511;&nbsp;&amp;</p>', [['tag', 'p', [['text', '🔑\u00a0&']]]]],
];

// DOM tree relationships must be reciprocal and acyclic, with stable handles.
function tree(node, seen = new Set()) {
  assert(!seen.has(node), 'A node occurs twice in the tree'); seen.add(node);
  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    assert.equal(children[i].parent, node);
    assert.equal(children[i].parentNode, node);
    assert.equal(children[i].prev, children[i - 1] ?? null);
    assert.equal(children[i].next, children[i + 1] ?? null);
    assert.equal(node.childNodes[i], children[i]);
  }
  if (node.type === 'text' || node.type === 'comment') return [node.type, node.data];
  return [node.type, node.name, children.map(child => tree(child, seen))];
}
for (const [name, source, expected] of fixtures) test(`Cheerio parse contract: ${name}`, () => {
  const $ = load(source, {}, false);
  try {
    const root = $.root()[0];
    assert.equal(root.type, 'root');
    assert.equal(root.parent, null); assert.equal(root.prev, null); assert.equal(root.next, null);
    assert.deepEqual(tree(root)[2], expected);
  } finally { $.dispose(); }
});

test('Cheerio XML load option preserves well-formed script children as elements', () => {
  const $ = load('<body><script><foo/></script></body>', { xml: true });
  try {
    assert.equal($('script').children()[0].type, 'tag');
    assert.equal($('script').children()[0].name, 'foo');
    tree($.root()[0]);
  } finally { $.dispose(); }
});

test('Cheerio empty HTML and enabled selectors retain documented browser differences', () => {
  const $ = load('<a id="link" href="/x"></a><div id="box"></div><input id="input" disabled>');
  try {
    assert.equal($('missing').html(), null);
    assert.deepEqual($('body :enabled').map((_, n) => n.attribs.id).get(), ['link', 'box']);
  } finally { $.dispose(); }
});

for (const execution of ['buffered', 'direct']) test(`${execution}: clone/move/replace preserves tree links and saved nodes`, () => {
  const $ = load('<main><section id="a"><b>one</b><i>two</i></section><section id="b"></section></main>', { execution });
  try {
    const saved = $('i')[0], old = $('section'), clone = $('#a').clone().attr('id', 'clone');
    $('#b').append(clone); $('#a').append($(saved));
    clone.find('b').text('changed'); $('#a').replaceWith('<aside>replacement</aside>');
    tree($.root()[0]); tree(old[0]);
    assert.equal(old.length, 2); assert.equal(old[0].parent, null);
    assert.equal($(saved).text(), 'two');
    assert.equal($('#clone b').text(), 'changed');
    assert.equal($('main').html(), '<aside>replacement</aside><section id="b"><section id="clone"><b>changed</b><i>two</i></section></section>');
  } finally { $.dispose(); }
});
