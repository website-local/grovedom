// Independent, seeded shapes for the optional offline corpus diagnostic.
// No network, file I/O or GroveDOM-specific fixture generation.
const families = ['wide', 'deep', 'long-values', 'unicode', 'entities', 'broken',
  'namespaces', 'comments', 'many-attributes', 'overlap', 'tokens', 'controls',
  'tiny', 'truncated', 'mixed', 'name-boundaries'];
const words = ['plain', 'é漢字', 'مرحبا', 'हिन्दी', '𐐀🙂', 'AΣςİKſ', 'e\u0301',
  'x\u00a0y\u2003z', '<&>"\'', 'one\ntwo\tthree', '\ufeffBOM', ''];
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function corpusRandom(seed) {
  let state = seed >>> 0 || 1;
  return maximum => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % maximum;
  };
}

export function balancedFixture(ordinal) {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= 50)
    throw new RangeError('Expected a corpus ordinal from 0 to 49');
  const seed = (0x6d2b79f5 + Math.imul(ordinal, 0x9e3779b9)) >>> 0;
  const random = corpusRandom(seed), mode = ['html', 'xml', 'svg'][ordinal % 3];
  const family = families[Math.floor(ordinal / 3) % families.length];
  const pick = values => values[random(values.length)];
  const tag = mode === 'html' ? 'section' : mode === 'xml' ? 'Item' : 'g';
  const leaf = mode === 'html' ? 'span' : mode === 'xml' ? 'entry' : 'text';
  let sequence = 0;
  function node(content = escape(pick(words)), attributes = '', name = tag) {
    const id = sequence++;
    return `<${name} id="n${id}" class="${pick(['active', 'a b', 'a\tb', 'É Σ', ''])}" data-v="${escape(pick(words))}" ${attributes}>${content}</${name}>`;
  }
  const line = () => node(node(undefined, '', leaf));
  let body;
  switch (family) {
    case 'wide': body = Array.from({ length: 512 + random(129) }, line).join(''); break;
    case 'deep': {
      const depth = 256 + random(129);
      body = `<${tag} class="outer">`.repeat(depth) + node('bottom', '', leaf) + `</${tag}>`.repeat(depth);
      break;
    }
    case 'long-values': body = node('large value', `data-long="${escape(pick(words) + 'a'.repeat(65536) + '\n\t"&' + '漢'.repeat(8192))}"`) + line(); break;
    case 'unicode': body = Array.from({ length: 96 }, () => node(escape(pick(words).repeat(1 + random(9))), 'title="İΣKſ𐐀"')).join(''); break;
    case 'entities': body = Array.from({ length: 72 }, () => node('&amp;&lt;&gt;&quot;&apos;&#160;&#x1f642;', 'title="&amp;&quot;&#10;&#9;&#x1f642;"')).join(''); break;
    case 'broken': body = '<p><b>misnested<i>text</b>end</i><table>foster<tr><td>x</table><select><option>a<div>b</select>\u0000<!--unterminated'; break;
    case 'namespaces': body = mode === 'html'
      ? '<svg viewBox="0 0 9 9"><defs><path id="p" d="M0 0L9 9"/></defs><use xlink:href="#p"/><foreignObject><p lang="ar">مرحبا</p></foreignObject></svg><math><mi>x</mi><annotation-xml encoding="text/html"><b>HTML</b></annotation-xml></math>'
      : '<ns:Item xmlns:ns="urn:corpus" xml:lang="ja" ns:Key="漢"><ns:Leaf a="1" A="2"/></ns:Item><MiXeD LongName="x" longname="y"/>';
      break;
    case 'comments': body = '<!-- α comment -->' + node('left<!-- inner -->right') + (mode === 'html'
      ? '<script>if (a < b) s = "&amp;";</script><style>.x::before{content:"<&>"}</style><textarea>&lt;a&gt;</textarea>'
      : '<?corpus data?><entry><![CDATA[<&>漢字]]>tail</entry>'); break;
    case 'many-attributes': body = Array.from({ length: 8 }, () => node('attributes', Array.from({ length: 128 }, (_, i) => `data-k${i}="${escape(pick(words))}"`).join(' '))).join(''); break;
    case 'overlap': body = Array.from({ length: 24 }, () => node(node(node(node(undefined, '', leaf))), '', tag)).join(''); break;
    case 'tokens': body = Array.from({ length: 128 }, (_, i) => `<${leaf} id="t${i}" class="${['a b', 'b\tc', 'a\nc', 'a\fb', 'a\rb', 'a\u00a0b', 'a\u2003b'][i % 7]}" data-v="${escape(pick(words))}">token</${leaf}>`).join(''); break;
    case 'controls': body = mode === 'html'
      ? '<form><fieldset disabled><legend><input name="inlegend" value="a"></legend><input name="off" value="b"></fieldset><input name="check" type="checkbox" checked><select name="choice" multiple><option selected>A<option value="b" selected>B</select><textarea name="text">line\n漢</textarea><button>Go</button></form><table><caption>C</caption><tbody><tr><td>A<td>B</table>'
      : node('<entry enabled="true" checked="checked" empty=""/><entry enabled="false"/>', 'xmlns:x="urn:controls"'); break;
    case 'tiny': body = mode === 'html' ? '<p>x' : '<entry/>'; break;
    case 'truncated': body = Array.from({ length: 17 }, line).join('') + `<${tag} data-cut="unterminated &amp`; break;
    case 'mixed': body = mode === 'html'
      ? '<template><table><tr><td>T</table><template><span>N</span></template></template><noscript><b>N</b></noscript><div hidden><img src="/img.png"><a href="../relative?q=x&amp;y=z">link</a></div>' + Array.from({ length: 64 }, line).join('')
      : '<entry>left<Inner/>middle<![CDATA[cdata]]>right</entry>' + Array.from({ length: 64 }, line).join(''); break;
    case 'name-boundaries': body = [1, 2, 3, 4, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65].map(length => {
      const name = 'N' + 'x'.repeat(length - 1), different = name.slice(0, -1) + 'Y';
      return node(`<${different}/><${name}/>`, `${name}="one" ${different}="two"`, name);
    }).join(''); break;
    default: throw new Error('Unknown corpus family');
  }
  let source = mode === 'html' ? `<!doctype html><html lang="en"><head><title>${family}</title></head><body><main>${body}</main></body></html>`
    : mode === 'svg' ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`
      : `<?xml version="1.0"?><Root xmlns="urn:corpus">${body}</Root>`;
  if (family === 'truncated') source = source.slice(0, source.lastIndexOf('unterminated') + 8);
  return { id: `synthetic-${String(ordinal + 1).padStart(2, '0')}-${mode}-${family}`,
    ordinal, seed, group: 'synthetic', mode, family,
    malformed: family === 'broken' || family === 'truncated', source };
}

export const corpusSelectors = ['*', '[id]', '[class]', '[title]', 'a[href]', 'img[src]',
  'input, select, textarea, button', 'table tr > td', 'main > *', 'article p',
  'template', 'svg', 'svg text', '[data-v]', 'div:not([hidden])', ':is(h1,h2,h3)',
  '[lang]', 'form :checked', '[title*="a" i]', ':nth-child(2n)', 'ul > li',
  '[href^="/"]', '[class~="active"]', 'Item', 'entry', 'g', 'text'];

export function corpusOperations(seed) {
  const random = corpusRandom(seed);
  return Array.from({ length: 12 }, (_, index) => ({
    action: ['attr', 'text', 'append', 'prepend', 'before', 'after', 'clone', 'remove', 'toggle', 'batch', 'observe', 'attr'][index],
    index: random(32), value: words[random(words.length)] + ':' + index,
  }));
}
