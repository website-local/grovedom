import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const sources = [
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="asset.png" xml:lang="en"/></svg>',
  '<svg><image href="plain" xlink:href="linked" xml:lang="en" lang="fr" xmlns:xlink="ns"/></svg>',
  '<svg><image xlink:href="linked" href="plain" lang="fr" xml:lang="en"/></svg>',
  '<svg><image xmlns:xlink="ns" xlink="plain"/></svg>',
];
function attributes($) {
  const image = $('image');
  return { object: { ...image.attr() }, raw: { ...image[0].attribs },
    getters: ['href', 'xlink:href', 'lang', 'xml:lang', 'xlink', 'xmlns:xlink'].map(name => [name, image.attr(name)]),
    selections: ['[href]', '[xlink\\:href]', '[lang]', '[xml\\:lang]'].map(selector => [selector, $(selector).length]),
    html: $.html(), xml: $.xml(), htmlAsXML: $.html({ xmlMode: true }) };
}
for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  for (const [index, source] of sources.entries()) test(`${execution} foreign attributes ${index}, xml=${xml}`, () => {
    const options = xml ? { xml: true } : {}, $ = load(source, { ...options, execution }), c = cheerio(source, options);
    const same = () => assert.deepEqual(attributes($), attributes(c));
    try {
      same();
      for (const open of [$, c]) open('image').attr('href', (_, old) => `${old ?? 'missing'}-local`);
      same();
      for (const open of [$, c]) { open('image').removeAttr('href lang'); delete open('image')[0].attribs.xlink; }
      same();
      for (const open of [$, c]) {
        const clone = open('image').clone();
        clone.attr('href', 'clone.png').attr('lang', 'zh').attr('xlink', 'clone-ns');
        open('svg').append(clone);
        open('image').first().attr('href', 'restored.png').attr('lang', 'en').attr('xlink', 'restored-ns');
      }
      same();
    } finally { $.dispose(); }
  });
  test(`${execution} parsed foreign fragments retain attribute behavior, xml=${xml}`, () => {
    const options = xml ? { xml: true } : {}, $ = load('<main/>', { ...options, execution }), c = cheerio('<main/>', options);
    try {
      for (const open of [$, c]) open('main').append(sources[0]);
      assert.deepEqual(attributes($), attributes(c));
      for (const open of [$, c]) open('image').attr('href', 'local.png');
      assert.deepEqual(attributes($), attributes(c));
    } finally { $.dispose(); }
  });
}
for (const namespace of ['svg', 'math']) for (const tag of ['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript']) {
  test(`${namespace} ${tag} serialization preserves escaped text and round trips`, () => {
    const source = `<${namespace}><${tag}>&amp;lt; &lt;g&gt; &amp; &#160;</${tag}></${namespace}>`;
    const $ = load(source), c = cheerio(source);
    try {
      assert.equal($.html(), c.html());
      const again = load($.html());
      try { assert.equal(again(namespace).text(), c(namespace).text()); assert.equal(again('g').length, 0); }
      finally { again.dispose(); }
    } finally { $.dispose(); }
  });
}
test('HTML style and script continue to serialize raw text', () => {
  const source = '<style>a>b{x:y} /* & */</style><script>if (a < b && c > d) run()</script>';
  const $ = load(source);
  try { assert.equal($.html(), cheerio(source).html()); }
  finally { $.dispose(); }
});

test('foreign renames preserve namespace, case, attributes and retained identity', () => {
  const source = '<svg><image id="x" xlink:href="a">&lt;g&gt;</image></svg>';
  const $ = load(source), c = cheerio(source), retained = $('#x')[0];
  try {
    for (const name of ['foreignObject', 'CustomName', 'custom-name', 'style', 'image']) {
      retained.name = name; c('#x')[0].name = name;
      assert.equal($('#x')[0], retained);
      assert.equal(retained.name, c('#x')[0].name);
      assert.equal($.html(), c.html(), name);
      assert.equal($(name).length, c(name).length, name);
      assert.equal($(`svg > ${name}`).length, c(`svg > ${name}`).length, name);
      assert.equal($.xml(), c.xml(), name);
    }
  } finally { $.dispose(); }
});

for (const xml of [false, true]) test(`foreign mixed-case selectors match Cheerio, xml=${xml}`, () => {
  const source = '<svg viewBox="0 0 10 10"><foreignObject id="foreign" preserveAspectRatio="xMidYMid"><div>content</div></foreignObject><linearGradient id="gradient"/></svg><foreignobject id="html" viewbox="html"></foreignobject>';
  const options = xml ? { xml: true } : {}, $ = load(source, options), c = cheerio(source, options);
  const selectors = ['foreignObject', 'foreignobject', 'linearGradient', '[viewBox]', '[viewbox]', '[viewBox="0 0 10 10"]', '[preserveAspectRatio]', ':is(foreignObject,[viewBox])', 'svg:has(foreignObject)', 'svg:has([viewBox])', ':not([viewBox])', 'svg > :is(foreignObject,linearGradient)'];
  const check = () => {
    assert.deepEqual($('*').toArray().map(n => n.name), c('*').toArray().map(n => n.name));
    for (const selector of selectors) {
      assert.deepEqual($(selector).toArray().map(n => [n.name, { ...n.attribs }]), c(selector).toArray().map(n => [n.name, { ...n.attribs }]), selector);
      assert.equal($('#foreign').is(selector), c('#foreign').is(selector), selector + ' .is');
    }
  };
  try {
    check();
    for (const open of [$, c]) { open('svg').attr('viewbox', 'lower'); open('#foreign').attr('preserveaspectratio', 'lower'); }
    check();
    for (const selector of ['[viewBox=lower]', '[viewBox^=LOW i]', '[preserveAspectRatio=lower]']) assert.equal($(selector).length, c(selector).length, selector);
  } finally { $.dispose(); }
});
