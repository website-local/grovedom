import assert from 'node:assert/strict';

// Check the native tree independently of the differential oracle. Cheerio's
// hidden clone roots deliberately have different sibling links.
export function checkLinks(roots) {
  const visited = new Set(), pending = [];
  for (let root of roots) {
    const ancestors = new Set();
    while (root.parent) {
      assert(!ancestors.has(root), 'Cycle in parent links'); ancestors.add(root);
      root = root.parent;
    }
    pending.push(root);
  }
  const expandedRoots = new Set();
  for (const root of pending) {
    if (expandedRoots.has(root)) continue;
    expandedRoots.add(root);
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      assert(!visited.has(node), 'A node appears twice in the tree'); visited.add(node);
      const children = node.children ?? [];
      for (let i = 0; i < children.length; i++) {
        assert.equal(children[i].parent, node, 'Parent link');
        assert.equal(children[i].prev, children[i - 1] ?? null, 'Previous sibling link');
        assert.equal(children[i].next, children[i + 1] ?? null, 'Next sibling link');
        assert.equal(node.childNodes[i], children[i], 'Stable child identity');
      }
      stack.push(...children);
    }
  }
}

export function execute(factory, item, { execution = 'buffered', links = false, progress = () => {} } = {}) {
  let $;
  try {
    progress({ phase: 'parse' });
    $ = factory(item.source, { xml: item.xml, execution });
    const retained = ['.a', '.b', '[data-v]'].map(selector => $(selector));
    const identities = retained.map(s => s.get());
    const observations = [], events = [];
    for (const [step, op] of item.operations.entries()) {
      progress({ phase: 'operation', step });
      const found = $(op.selector), selected = op.index === null ? found : found.eq(op.index);
      switch (op.action) {
        case 'attr': selected.attr('data-v', op.value); break;
        case 'text': selected.text(op.value); break;
        case 'append': selected.append(op.markup); break;
        case 'prepend': selected.prepend(op.markup); break;
        case 'before': selected.before(op.markup); break;
        case 'after': selected.after(op.markup); break;
        case 'remove': selected.remove(); break;
        case 'empty': selected.empty(); break;
        case 'class': selected.toggleClass('a b'); break;
        case 'clone': selected.append(selected.children().first().clone()); break;
        case 'batch':
          // No query/getter between writes: exercise ordered queues, shared
          // selection aliases and UTF-8 payload offsets before one observation.
          selected.attr('data-before', 'prefix').text(op.value)
            .attr('data-v', op.value).attr('data-after', 'suffix');
          retained[0].attr('data-retained', op.value);
          break;
        case 'attrCallback':
        case 'callbackThrow': {
          const sentinel = new Error('fuzz callback'), stop = Math.floor(selected.length / 2);
          try {
            selected.attr('data-v', function (i, old) {
              events.push([step, i, old, this === selected[i], $(this).text()]);
              $(this).attr('data-side', op.value);
              if (op.action === 'callbackThrow' && i === stop) throw sentinel;
              return (old ?? '') + op.value;
            });
          } catch (error) { if (error !== sentinel) throw error; events.push([step, 'caught']); }
          break;
        }
        case 'observe': break;
        default: throw new Error('Unknown fuzz operation: ' + op.action);
      }
      for (let i = 0; i < retained.length; i++) assert.deepEqual(retained[i].get(), identities[i], 'Selection membership changed');
      observations.push({ length: found.length, selectedLength: selected.length, selected: selected.toString(), text: selected.text(),
        nodes: selected.get().map(node => ({ name: node.name, attrs: { ...node.attribs } })),
        retained: retained.map(s => [s.length, s.text(), s.toString()]),
        output: item.xml ? $.xml() : $.html() });
    }
    progress({ phase: 'selectors' });
    const selectors = (item.selectors ?? []).map(selector => [selector,
      $(selector).get().map(node => [node.name, { ...node.attribs }])]);
    if (links) checkLinks([$.root()[0], ...identities.flat()]);
    return { observations, events, selectors };
  } finally { $?.dispose?.(); }
}
