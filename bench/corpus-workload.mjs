import { corpusSelectors, corpusOperations } from './balanced-fixtures.mjs';

// Bounded observations, but parsing/final serialization cover the whole input.
// Returned values are compared/hashed outside any diagnostic timer.
export function replayCorpus(load, item, { execution = 'buffered', progress = () => {} } = {}) {
  let $, retained, identities;
  const phases = {};
  const record = (name, value) => { phases[name] = value; progress(name, value); };
  const describe = node => node ? [node.type ?? null, node.name ?? null] : null;
  const summary = (selection, limit = 6) => ({ length: selection.length,
    nodes: selection.slice(0, limit).get().map(node => [node.type, node.name ?? null, Object.entries($(node).attr() ?? {})]) });
  const markup = item.mode === 'html' ? '<i data-corpus-insert="1">é &amp; 漢</i>' : '<Probe data-corpus-insert="1">é &amp; 漢</Probe>';
  const checkSnapshot = () => {
    if (retained.length !== identities.length || identities.some((node, i) => retained[i] !== node))
      throw new Error('Selection snapshot membership or identity changed');
  };
  try {
    progress('parse');
    $ = load(item.source, { xml: item.mode !== 'html', execution });
    record('initial', item.mode === 'html' ? $.html() : $.xml());
    progress('queries');
    record('queries', corpusSelectors.map(selector => [selector, summary($(selector))]));
    progress('relations');
    const edges = $('*').slice(0, 24).get();
    record('relations', edges.map(node => [describe(node), describe(node.parent),
      describe(node.prev), describe(node.next), describe(node.firstChild), describe(node.lastChild),
      node.children?.length ?? 0, Object.entries(node.attribs ?? {})]));
    progress('traversal');
    const roots = $('div, section, article, Item, g').slice(0, 12);
    record('traversal', [summary(roots.find('span, p, a, entry, text')),
      summary(roots.slice(0, 4).nextUntil('[data-stop]')),
      summary(roots.slice(0, 4).parentsUntil('main, Root, svg'))]);
    retained = $('[id], a[href], .corpus-keep').slice(0, 16);
    identities = retained.get();
    progress('callbacks');
    const callbacks = [], selected = $('*').slice(0, 24), selectedNodes = selected.get();
    selected.attr('data-corpus', function (i, old) {
      callbacks.push([i, old ?? null, this === selectedNodes[i], $(this).is('a'),
        $(this).is('iframe'), $(this).text().slice(0, 64)]);
      $(this).attr('data-corpus-side', String(i));
      return `v${i}:é&漢`;
    });
    checkSnapshot();
    record('callbacks', callbacks);
    progress('attributes');
    record('attributes', selected.get().map(node => [Object.entries($(node).attr() ?? {}), Object.entries(node.attribs ?? {})]));
    progress('mutations');
    const targets = $('p, span, li, a, code, Item, entry, g, text').slice(0, 32);
    const host = item.mode === 'html' ? $('body').first() : $.root().children().first();
    const mutations = [];
    for (const [step, op] of (item.operations ?? corpusOperations(item.seed)).entries()) {
      const target = targets.eq(op.index % Math.max(1, targets.length));
      switch (op.action) {
        case 'attr': target.attr('data-v', op.value); break;
        case 'text': target.text(op.value); break;
        case 'append': target.append(markup); break;
        case 'prepend': target.prepend(markup); break;
        case 'before': target.before(markup); break;
        case 'after': target.after(markup); break;
        case 'clone': host.append(target.clone().text(op.value).attr('data-corpus-clone', '1')); break;
        case 'remove': target.remove(); break;
        case 'toggle': target.toggleClass('active corpus'); break;
        case 'batch': target.attr('data-before', 'prefix').text(op.value).attr('data-after', 'suffix'); break;
        case 'observe': break;
        default: throw new Error('Unknown corpus operation: ' + op.action);
      }
      checkSnapshot();
      mutations.push([step, op.action, summary(target), target.text(), target.toString()]);
    }
    host.append(markup);
    checkSnapshot();
    record('mutations', mutations);
    record('retained', [summary(retained, 16), retained.text()]);
    record('final', item.mode === 'html' ? $.html() : $.xml());
    return phases;
  } finally { $?.dispose?.(); }
}
