import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

test('successful form values and serialization follow Cheerio, including its fieldset behavior', () => {
  const source = '<form><fieldset disabled><legend><input name=a value=a></legend><input name=b value=b></fieldset><input name=c disabled><select name=empty></select><keygen name=k><select name=s multiple><optgroup disabled><option selected value=x>text x</option></optgroup><option selected disabled value=y>text y</option></select><select name=group><optgroup><option>first</option></optgroup></select><option id=o>  text  </option><input id=check type=checkbox><input id=plain></form>';
  const $ = load(source), c = cheerio(source);
  try {
    assert.deepEqual($('form').serializeArray(), c('form').serializeArray());
    for (const id of ['#o', '#check', '#plain', 'select[name=group]']) {
      assert.equal($(id).attr('value'), c(id).attr('value'));
      assert.equal($(id).val(), c(id).val());
    }
  } finally { $.dispose(); }
});

test('URL properties resolve only the element/property combinations supported by Cheerio', () => {
  const source = '<a href="/x"></a><area href="/x"><link href="/x"><div href="/x" src="/x"></div><img src="/x"><script src="/x"></script><iframe src="/x"></iframe>';
  const $ = load(source, { baseURI: 'https://example.test/base' }), c = cheerio(source, { baseURI: 'https://example.test/base' });
  try { for (const name of ['href', 'src']) assert.deepEqual($(`[${name}]`).map((_, n) => $(n).prop(name)).get(), c(`[${name}]`).map((_, n) => c(n).prop(name)).get()); }
  finally { $.dispose(); }
});

test('connected ordering, detached subtrees and retained selection identity', () => {
  function replay($) {
    const retained = $('#b')[0], detached = $('#a').remove();
    const first = detached.find('i').addBack().map((_, n) => n.attribs.id).get();
    $('main').prepend(detached);
    const second = $('#b').add('#a, #a i').map((_, n) => n.attribs.id).get();
    assert.equal($('#b')[0], retained);
    return [first, second];
  }
  const source = '<main><div id=a><i id=i></i></div><div id=b></div></main>';
  const $ = load(source);
  try { assert.deepEqual(replay($), replay(cheerio(source))); }
  finally { $.dispose(); }
});
