import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

// Authored from implementation review, not copied upstream tests. References:
// Cheerio 1.2.0 api/{attributes,css,traversing}.ts; css-select 5.2.2
// attributes and pseudo-selectors; domutils 3.2.2 stringify; entities decoder.
const ids = selection => selection.map((_, node) => node.attribs.id ?? node.name).get();
function compare(source, run, options = {}) {
  const $ = load(source, options);
  try { assert.deepEqual(run($), run(cheerio(source, options))); }
  finally { $.dispose(); }
}

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`attribute callbacks read raw values, skip non-elements and stringify returns: ${execution}, xml=${xml}`, () => {
    compare('<root>text<input type="checkbox" disabled="no"/><!--c--><input type="checkbox"/></root>', $ => {
      const items = $('root').contents(), seen = [];
      items.attr('disabled', function (i, old) {
        seen.push([i, old, this === items[i]]);
        return old;
      });
      items.attr('value', function (i, old) { seen.push([i, old]); return i ? null : 'x'; });
      const value = function literal() {};
      items.attr('data-function', () => value);
      return [seen, $('root').html()];
    }, { execution, xml });
  });

  test(`attribute maps preserve per-element coercion order: ${execution}, xml=${xml}`, () => {
    compare('<root><p/><p/></root>', $ => {
      const events = [];
      const value = { toString() { events.push($('p').map((_, node) => node.attribs.x ?? '-').get()); return 'X'; } };
      $('p').attr({ x: value, y: undefined });
      return [events, $('root').html()];
    }, { execution, xml });
  });
}

test('data reads cache individual exact keys and discover later attributes', () => {
  compare('<p data-a="1" data-b="2" data-test-key="3"></p>', $ => {
    const p = $('p'), seen = [p.data('a')];
    p.attr('data-b', '4').attr('data-c', 'true');
    p.data('test-key', 5);
    seen.push(p.data('b'), p.data('c'), p.data('testKey'), p.data('test-key'));
    const all = p.data();
    delete all.a;
    p.attr('data-a', '6');
    seen.push(p.data('a'), { ...p.data() });
    return seen;
  });
});

test('data setters do not cache attributes before their first read', () => {
  compare('<p data-a="1"></p>', $ => {
    const p = $('p');
    p.data({ explicit: 2 });
    p.attr('data-a', '3');
    return p.data();
  });
});

test('class mutations preserve Cheerio spacing and duplicate-token behavior', () => {
  for (const original of ['a\tb', ' a  b ', 'a\u00a0b', 'a\u2003b', 'a a b']) {
    for (const action of ['addClass', 'removeClass', 'toggleClass']) {
      for (const value of ['a', 'b', 'missing', '']) {
        compare(`<p class="${original}"></p>`, $ => {
          $('p')[action](value);
          return [$('p').attr('class'), $('p').hasClass('a'), $('p').hasClass('a b')];
        });
      }
    }
  }
});

test('boolean properties use truthiness while ismap remains an ordinary attribute', () => {
  for (const value of [false, true, 0, 1, '', 'yes', null]) compare('<input><img ismap="custom">', $ => {
    $('input').prop('disabled', value);
    return [{ ...$('input').attr() }, $('input').prop('disabled'), $('img').attr('ismap'), $('img').prop('ismap')];
  });
});

test('style parsing preserves continuation whitespace and null callback results', () => {
  for (const style of ['color:red; url(data', 'font: a; b ; color: ;', 'color:red; x:', 'color:red; :bad']) {
    compare(`<p style="${style}"></p>`, $ => {
      const before = $('p').css();
      $('p').css('color', () => null);
      return [before, $('p').attr('style')];
    });
  }
});

test('link, checked, disabled and dynamic-state selectors follow css-select aliases', () => {
  const source = '<link id="link" href="x"><map id="map" href="x"></map><a id="a" href="x"></a><area id="area" href="x"><div id="dynamic" active hover></div><widget id="custom" checked disabled></widget><input id="input" type="CHECKBOX" checked><select><option id="implicit">one</option></select><fieldset id="fieldset" disabled><legend>x</legend><input id="nested"></fieldset>';
  compare(source, $ => [':any-link', ':link', ':checked', ':disabled', ':enabled', ':active', ':hover', ':visited', ':not(:checked)', ':is(:disabled,:checked)'].map(selector => ids($(selector))));
});

test('HTML attribute-value case defaults include SVG and MathML; explicit flags win', () => {
  for (const xml of [false, true]) {
    compare('<svg id="svg" type="UP" lang="EN-us" data-x="UP"></svg><math id="math" type="UP"></math><div id="html" type="UP"></div>', $ => {
      const result = [];
      for (const op of ['=', '^=', '$=', '*=', '~=', '|=']) {
        for (const flag of ['', ' i', ' s']) result.push(ids($(`[type${op}"up"${flag}]`)));
      }
      result.push(ids($('[lang|="en"]')), ids($('[data-x="up"]')));
      return result;
    }, { xml });
  }
});

test('root selectors recognize detached and fragment roots', () => {
  compare('<main><p id="p"><b id="b"></b></p></main>', $ => {
    const detached = $('p').remove();
    return [ids(detached.filter(':root')), ids(detached.find(':root')), ids($('<i id="i"></i>').filter(':root'))];
  });
  const $ = load('<i id="i"></i><b id="b"></b>', {}, false);
  try { assert.deepEqual(ids($(':root')), ids(cheerio('<i id="i"></i><b id="b"></b>', {}, false)(':root'))); }
  finally { $.dispose(); }
});

test('traversal filters precede ordering and deduplication', () => {
  const source = '<main id="m"><section id="s"><i id="a"></i><b id="b"></b><i id="c"></i></section><section id="t"><i id="d"></i></section></main>';
  compare(source, $ => {
    const result = [];
    for (const roots of [['#a', '#b'], ['#s', '#a'], ['#d', '#b']]) {
      const collection = $(roots.flatMap(selector => $(selector).get()));
      for (const axis of ['siblings', 'parents', 'nextAll', 'prevAll']) {
        for (const selector of [':first', ':last', ':eq(2)', ':odd']) result.push(ids(collection[axis](selector)));
        const seen = [];
        result.push(ids(collection[axis](function (i, node) { seen.push([i, node.attribs.id]); return i % 2 === 0; })), seen);
      }
    }
    const duplicate = $([$('#a')[0], $('#a')[0], $('#b')[0]]);
    result.push(ids(duplicate.filter('i')), ids(duplicate.filter('i:eq(1)')));
    return result;
  });
});

test('innerText skips document/template roots and HTML script/style node types', () => {
  for (const xml of [false, true]) compare('<main>one<style>style</style><script>script</script><template>template</template>two</main>', $ =>
    [$.root().prop('innerText'), $('main').prop('innerText'), $('template').prop('innerText')], { xml });
});

test('HTML doctype handles expose parse5-adapter name and data without changing serialization', () => {
  for (const declaration of ['<!DOCTYPE html>', '<!DOCTYPE HTML PUBLIC "pub" "sys">', '<!DOCTYPE html SYSTEM "sys">', '<!DOCTYPE html PUBLIC \'a"b\' "sys">']) {
    compare(declaration + '<p>x</p>', $ => {
      const node = $.root().contents()[0];
      return [node.name, node.type, node.data, $.html()];
    });
  }
});

test('XML numeric C1 references use the entities decoder replacement table', () => {
  const numeric = Array.from({ length: 32 }, (_, i) => `&#${i + 128};&#x${(i + 128).toString(16)};`).join('');
  for (const xml of [true, { decodeEntities: false }]) compare(`<r a="${numeric}">${numeric}\u0080</r>`, $ =>
    [$('r').attr('a'), $('r').text(), $.html()], { xml });
});
