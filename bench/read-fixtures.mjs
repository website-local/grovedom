// Authored confirmations for specific read/selection costs. Retained-document
// cases exclude setup and disposal; nested wrapping includes the full lifetime.
export const readCases = [
  { id: 'first-read-6000', kind: 'retained-document', rows: 6000, repeats: 64 },
  { id: 'raw-children-128', kind: 'retained-document', rows: 128, repeats: 4 },
  { id: 'text-properties', kind: 'retained-document', repeats: 256 },
  { id: 'nested-wrapping', kind: 'full-replay', rows: 16, depth: 8 },
];

export function prepareReadCase(load, id) {
  const spec = readCases.find(item => item.id === id);
  if (!spec) throw new Error('Unknown read fixture: ' + id);
  if (id === 'nested-wrapping') {
    const source = '<main>' + '<p>text</p>'.repeat(spec.rows) + '</main>';
    const wrapper = '<section>' + '<div>'.repeat(spec.depth - 1) + '<span></span>' +
      '</div>'.repeat(spec.depth - 1) + '</section>';
    return { spec, dispose() {}, run() {
      const $ = load(source);
      try {
        $('p').wrap(wrapper).wrapInner('<i><b></b></i>');
        return $.html();
      } finally { $.dispose?.(); }
    } };
  }
  const source = id === 'first-read-6000'
    ? '<main>' + '<p title="value" data-v="kept">text<b>child</b></p>'.repeat(spec.rows) + '</main>'
    : id === 'raw-children-128'
      ? '<main>' + '<section>text<span>a</span><!--gap--><b>b</b></section>'.repeat(spec.rows) + '</main>'
      : '<main><p>A<b>B</b><script>C</script></p><select><option>fallback</option></select></main>';
  const $ = load(source), dispose = () => $.dispose?.();
  if (id === 'first-read-6000') {
    const nodes = $('p');
    return { spec, dispose, run() {
      let consumed = 0, title, attributes, inner, outer, tag, value;
      for (let i = 0; i < spec.repeats; i++) {
        title = nodes.attr('title'); attributes = nodes.attr(); inner = nodes.html();
        outer = nodes.prop('outerHTML'); tag = nodes.prop('tagName'); value = nodes.attr('data-v');
        consumed += title.length + attributes.title.length + inner.length + outer.length + tag.length + value.length;
      }
      return { consumed, title, attributes: Object.entries(attributes), inner, outer, tag, value };
    } };
  }
  if (id === 'raw-children-128') {
    const nodes = $('section').get(), initial = nodes.map(node => node.children);
    return { spec, dispose, run() {
      let consumed = 0;
      for (let pass = 0; pass < spec.repeats; pass++) for (let i = 0; i < nodes.length; i++) {
        const children = nodes[i].children;
        consumed += children.length + Number(children[0] === initial[i][0]) + Number(children[3] === initial[i][3]);
      }
      return consumed;
    } };
  }
  const paragraph = $('p'), option = $('option');
  return { spec, dispose, run() {
    let consumed = 0, text, innerText, value;
    for (let i = 0; i < spec.repeats; i++) {
      text = paragraph.prop('textContent'); innerText = paragraph.prop('innerText'); value = option.attr('value');
      consumed += text.length + innerText.length + value.length;
    }
    return { consumed, text, innerText, value };
  } };
}
