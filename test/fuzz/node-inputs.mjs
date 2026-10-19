import assert from 'node:assert/strict';
import { checkLinks } from './execute.mjs';

function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

// Cheerio permits duplicate physical child entries and cross-owner adoption.
// Exercise these shapes separately against GroveDOM's identity/tree contract.
export function exerciseNodeInputs(factory, item, { execution = 'buffered', progress = () => {} } = {}) {
  if (!item.nodeInputs) return 0; // Historical reproducers retain their old scope.
  const { count, operations } = item.nodeInputs;
  let $, foreign;
  try {
    $ = factory('<main>' + Array.from({ length: count }, (_, i) => `<p id="n${i}">${i}</p>`).join('') + '</main>', { xml: item.xml, execution });
    foreign = factory('<main><p id="foreign">other</p></main>', { xml: item.xml, execution });
    const main = $('main'), original = $('p').get(), retained = $(original), context = foreign('main');
    const foreignOutput = foreign.html();
    for (const [step, op] of operations.entries()) {
      progress({ phase: 'node-input', step });
      const input = op.nodes.map(index => original[index]), selected = $(input);
      const target = op.method === 'append' || op.method === 'prepend' ? main : $(original[op.target]);
      target[op.method](op.selection ? selected : input);
      const children = main.children().get();
      assert.equal(children.length, original.length, 'Insertion lost a node');
      assert.equal(new Set(children).size, original.length, 'Insertion duplicated a physical node');
      for (const node of original) assert(children.includes(node), 'Insertion changed node identity');
      sameNodes(retained.get(), original);
      sameNodes(selected.get(), input);
      checkLinks([main[0], ...original]);
      sameNodes($(children[0]).nextAll().get(), children.slice(1));
      sameNodes($(children.at(-1)).prevAll().get(), children.slice(0, -1).reverse());
      sameNodes(selected.contents().get(), input.flatMap(node => node.children));
      for (const [method, offset] of [['next', 1], ['prev', -1]]) {
        const expected = input.map(node => children[children.indexOf(node) + offset]).filter(Boolean);
        sameNodes(selected[method]().get(), expected);
        sameNodes(selected[method]('p').get(), expected);
      }
      const before = $.html();
      assert.throws(() => selected.add(op.empty ? 'missing' : 'p', op.nodeContext ? context[0] : context)
        .attr('wrong-owner', 'changed'), error => error?.name === 'TypeError');
      assert.equal($.html(), before);
      assert.equal(foreign.html(), foreignOutput);
    }
    return operations.length;
  } finally { $?.dispose?.(); foreign?.dispose?.(); }
}
