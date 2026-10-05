// All randomness is consumed here; saved cases replay without generator state.
export const actions = ['observe', 'attr', 'text', 'append', 'prepend', 'remove', 'empty',
  'before', 'after', 'class', 'clone', 'batch', 'attrCallback', 'callbackThrow'];
export function uint32(value, name = 'seed') {
  const n = Number(value);
  if (String(value).trim() === '' || !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff)
    throw new TypeError(`Expected ${name} to be an unsigned 32-bit integer`);
  return n;
}
export function generator(seed, { templates = false, malformed = false } = {}) {
  seed = uint32(seed);
  let random = seed || 1;
  function next(max) { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return (random >>> 0) % max; }
  const pick = values => values[next(values.length)];
  const words = ['plain', 'é漢字', 'a & b', '<quote>"', '\u00a0', '', 'one\ntwo',
    'AΣ\u0301', 'İ', 'Kſ', '𐐀', 'a\u2003b', 'x\u200by', 'a'.repeat(63) + 'É', 'b'.repeat(65)];
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  return function generate(index) {
    const xml = Boolean(index % 2), tags = xml ? ['Item', 'Node', 'Path', 'svg', 'g'] : ['div', 'section', 'span', 'ul', 'li'];
    let id = 0;
    function tree(depth) {
      const tag = pick(tags), n = id++;
      const content = depth && next(3) ? Array.from({ length: 1 + next(3) }, () => tree(depth - 1)).join('') : escape(pick(words));
      return `<${tag} id="n${n}" class="${pick(['a', 'b', 'a b', 'omit', ''])}" data-v="${escape(pick(words))}">${content}</${tag}>`;
    }
    const profile = xml ? 'xml' : ['html', 'foreign', 'select', 'template'][(index >>> 1) % 4];
    const extras = {
      html: '', foreign: '<svg viewBox="0 0 8 8"><text class="a">&lt;é&gt;</text><use href="#n0" xlink:href="#n1"/></svg><math><mi class="b">x</mi></math>',
      select: '<select class="a"><option data-v="É">A</option><optgroup><option class="b" selected>B</option></optgroup></select>',
      template: '<template><section class="a"><span class="b" data-v="template">content</span></section></template>',
    };
    const hasTemplates = !xml && (templates || profile === 'template');
    let content = tree(3) + tree(2) + (extras[profile] ?? '');
    if (templates && profile !== 'template' && !xml) content += extras.template;
    let source = xml ? `<Root>${content}</Root>` : `<main>${content}</main>`;
    // Query through template fragments; direct template-container mutation has
    // documented upstream serialization differences and separate regressions.
    const selectors = [hasTemplates ? '*:not(template)' : '*', '.a', '.b',
      hasTemplates ? ':not(.omit):not(template)' : ':not(.omit)', '[data-v]', ...tags,
      tags[0] + ' > ' + tags[1], tags[0] + ', ' + tags[2],
      hasTemplates ? ':nth-child(2n):not(template)' : ':nth-child(2n)', '#n' + next(id),
      '[data-v*="é" i]', '[data-v^="A" i]', '[class~=""]', ':is(.a,.b)',
      '.a:has(.b)', '.a > .b', '[data-v$="É" i]', '[data-v|="k" i]'];
    const operations = Array.from({ length: 16 }, (_, step) => {
      const tag = pick(tags), value = pick(words);
      return { selector: pick(selectors), action: actions[(step + next(actions.length)) % actions.length],
        index: next(3) ? next(5) - 2 : null, value,
        markup: `<${tag} data-v="${escape(value)}">${escape(value)}</${tag}>` };
    });
    const corrupt = malformed ?? index % 9 === 8;
    if (corrupt) for (let i = 0; i < 8; i++) {
      const at = next(source.length + 1);
      source = source.slice(0, at) + pick(['<', '&', '"', '\u0000', '<!--', '<![CDATA[', '</', '']) + source.slice(at + next(4));
    }
    return { version: 2, seed, index, xml, profile, templates: hasTemplates, malformed: corrupt, source, selectors, operations };
  };
}
