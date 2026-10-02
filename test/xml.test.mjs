import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';
import { kernel } from '../src/kernel.js';

const svg = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><linearGradient id="G"><stop offset="0"/></linearGradient></defs><g class="icon"><Path ID="upper" d="M0 0"/><path id="lower" d="M1 1"/><use xlink:href="#G"/></g><title>é &amp; &#x1f600; &quot; &apos;</title><desc><![CDATA[x<y && z>0]]></desc><!--tail--></svg>';
const sitemap = '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.test/a.xml?x=1&amp;y=2</loc><lastmod>2026-01-01</lastmod></sitemap><sitemap><loc>https://example.test/二.xml</loc></sitemap></sitemapindex>';
function compare(source, run, options = { xml: true }) {
  const $ = load(source, options), c = cheerio(source, options);
  try { assert.deepEqual(run($), run(c)); }
  finally { $.dispose(); }
}
function shape(node) {
  return { type: node.type, name: node.name, data: node.data, attribs: node.attribs ? { ...node.attribs } : undefined,
    children: (node.children ?? []).map(shape) };
}

for (const execution of ['direct', 'buffered']) {
  test(`${execution}: SVG and sitemap XML parsing, declarations, CDATA and serialization`, () => {
    for (const source of [svg, sitemap, '', '<A/><a/>', '<r a="">\r\n&#65; &#x41; &unknown; &amp</r>']) {
      for (const xml of [true, { decodeEntities: false }, { encodeEntities: false }, { encodeEntities: 'utf8' }, { selfClosingTags: false }, { lowerCaseTags: true, lowerCaseAttributeNames: true }]) {
        compare(source, $ => [$.html(), $.xml(), $.text(), $.root().contents().map((i, node) => shape(node)).get()], { xml, execution });
      }
    }
    compare(svg, $ => $.html(), { xmlMode: true, execution });
    compare('<Root><script>x &lt; y</script><style>a</style><template><b/></template></Root>', $ => [
      $.xml(), $('Root').prop('innerText'), $('script,style,template').map((i, node) => shape(node)).get(),
    ], { xml: true, execution });
    const $ = load(Buffer.from(sitemap), { xml: true, execution }, false);
    try { assert.equal($.xml(), cheerio(sitemap, { xml: true }).xml()); } finally { $.dispose(); }
  });

  test(`${execution}: XML selectors preserve case, namespaces, nesting and class/id caches`, () => {
    const selectors = ['svg', 'SVG', 'linearGradient', 'lineargradient', 'Path', 'path', '#G', '#g', '#upper', '#lower', '.icon', '[viewBox]', '[viewbox]', '[ID]', '[id]', 'use[xlink\\:href="#G"]', 'svg > g > Path', 'Path + path', 'g:has(Path)', ':is(Path,path)', 'g > :not(Path)', 'g > :nth-child(2)', 'Path:nth-of-type(1)', 'path:nth-of-type(1)', 'desc:empty', ':root'];
    for (const selector of selectors) compare(svg, $ => $(selector).map((i, node) => node.name).get(), { xml: true, execution });
    for (const selector of ['[type="text"]', '[type="TEXT"]', '[type="text" i]', '[type="text" s]']) compare('<input type="TEXT"/>', $ => $(selector).length, { xml: true, execution });
  });

  test(`${execution}: XML mutations keep options, node identity and qualified names`, () => {
    for (const method of ['html', 'append', 'prepend', 'before', 'after', 'replaceWith']) compare(svg, $ => {
      $('title')[method]('<Text myAttr="&quot;é"><![CDATA[<b>]]></Text>');
      $('Text').attr('MyAttr', 'Value').attr('myAttr', 'other');
      return $.xml();
    }, { xml: true, execution });
    compare(svg, $ => {
      const clone = $('g').clone(); clone.find('Path').attr('id', 'copy'); clone.appendTo('svg');
      $('desc').clone().appendTo('svg');
      $('linearGradient')[0].name = 'RadialGradient';
      $('use').attr('xlink:href', '#changed');
      $('title').text('é < > & " \'');
      $('g').wrap('<Wrapper Name="outer"/>');
      return [$.xml(), $('RadialGradient').length, $('path').length];
    }, { xml: true, execution });
    compare('<input disabled="false"/><input/>', $ => {
      const first = [$('input').attr('disabled'), $('input').prop('disabled')];
      $('input').prop('disabled', false); return [first, $.xml()];
    }, { xml: true, execution });
  });
}

test('XML exposed CDATA text and detached nodes survive replacement until disposal', () => {
  const $ = load(svg, { xml: true });
  const desc = $('desc'), cdata = desc.contents()[0], text = cdata.children[0], path = $('Path')[0];
  try {
    assert.equal(cdata.type, 'cdata'); assert.equal(cdata.data, undefined);
    assert.equal(text.parent, cdata); assert.equal($(text).text(), 'x<y && z>0');
    text.data = 'changed'; assert.equal(desc.html(), '<![CDATA[changed]]>');
    $('svg').empty();
    assert.equal($(path).attr('ID'), 'upper');
    assert.equal(desc.parent().length, 0); assert.equal(desc.text(), 'changed');
    desc.appendTo('svg'); assert.equal($.xml().includes('<desc><![CDATA[changed]]></desc>'), true);
  } finally { $.dispose(); }
  assert.throws(() => text.data, { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(kernel.stats().liveBytes, 0);
});

test('XML replacement reuses arena slots and parse failures release backing storage', () => {
  const $ = load('<Root/>', { xml: true, execution: 'direct' }), root = $('Root');
  try {
    for (let i = 0; i < 100; i++) root.html(svg);
    const before = kernel.stats().liveBytes;
    for (let i = 0; i < 1000; i++) root.html(svg);
    assert.equal(kernel.stats().liveBytes, before);
    for (let i = 0; i < 80; i++) $(`Root > svg [missing${i}]`);
    assert.equal($('Path').length, 1);
  } finally { $.dispose(); }
  for (const source of ['<r><x/></R>', '<r a="x>', '<!--bad', '<![CDATA[bad', '<!DOCTYPE r [', '<r a="b"']) {
    assert.throws(() => load(source, { xml: true }));
    assert.equal(kernel.stats().liveBytes, 0);
  }
});

test('deep XML parses, clones, serializes and clears with bounded stack use', () => {
  const source = '<Root>' + '<Node>'.repeat(5000) + '<![CDATA[deep]]>' + '</Node>'.repeat(5000) + '</Root>';
  const $ = load(source, { xml: true });
  try {
    assert.equal($.xml(), source);
    assert.equal($('Root').clone().toString(), source);
    $('Root').html('<Leaf/>'); assert.equal($.xml(), '<Root><Leaf/></Root>');
  } finally { $.dispose(); }
});

test('XML internal subsets are preserved without DTD expansion or external resources', () => {
  const source = '<!DOCTYPE r [<!ENTITY x SYSTEM "https://example.test/x">]><r>&x;</r>';
  const $ = load(source, { xml: true });
  try { assert.equal($.xml(), source.replace('&x;', '&amp;x;')); assert.equal($('r').text(), '&x;'); }
  finally { $.dispose(); }
  const pi = load('<?pi a > b?><Root/>', { xml: true });
  try { assert.equal(pi.xml(), '<?pi a > b?><Root/>'); assert.equal(pi.root().contents()[0].data, '?pi a > b?'); }
  finally { pi.dispose(); }
});

test('XML names cannot collide with internal case-sensitive keys', () => {
  compare('<Root><Foo/><foo/><FOO/><xé/><Xé/><input ID="A" id="b" CLASS="A" class="b"/></Root>', $ => {
    const names = ['Foo', 'foo', 'FOO', 'xé', 'Xé', '[ID]', '[id]', '[Id]', '#A', '#b', '.A', '.b'];
    const first = names.map(s => $(s).length);
    $('Foo')[0].name = 'FOO';
    $('foo').attr('ID', 'C').attr('id', 'd');
    return [first, names.map(s => $(s).length), $.xml()];
  });
  assert.throws(() => load('<\u000178/>', { xml: true }));
  compare('<urlset xmlns:image="urn:image"><image:loc URL="a"/><image:Loc URL="b"/></urlset>', $ => [
    $('image\\:loc').length, $('image\\:Loc[URL]').length,
    $('urlset:has(image\\:loc)').length, $('image\\:loc').clone().toString(),
  ]);
  compare('<?xml version="1.0"?><A/><B><C/></B>', $ => {
    const before = $(':root').map((i, node) => node.name).get();
    $('A').remove(); return [before, $(':root:not(A)').map((i, node) => node.name).get()];
  });
});

test('XML serialization can be requested for an HTML document without changing its parser', () => {
  compare('<div title="é"><br><input disabled></div>', $ => [$.xml(), $.xml($('div'))], {});
});
