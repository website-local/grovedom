import test from 'node:test';
import assert from 'node:assert/strict';
import { load, loadFast } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main id="root"><section id="scope">text<!--child gap-->'
  + '<div id="child"><i id="deep" class="decoy"></i></div>'
  + '<i id="direct" class="hit" data-ok="yes"></i></section>text<!--sibling gap-->'
  + '<aside id="next"><i id="nested" class="decoy"></i></aside>'
  + '<article id="later" class="hit" data-ok="yes"></article><p id="tail"></p></main>';
const ids = selection => selection.get().map(node => node.attribs.id);

for (const [mode, loader] of [['compatible', load], ['fast', loadFast]]) {
  for (const execution of ['direct', 'buffered']) for (const xml of [false, true]) {
    const options = { execution, xml }, label = `${mode}, ${execution}, xml=${xml}`;

    test(`relative has tests direct children and element siblings (${label})`, () => {
      const $ = loader(source, options);
      try {
        for (const [selector, expected] of [
          [':has(> .hit)', true], [':has(> .decoy)', false],
          [':has(> i.hit[data-ok]:empty)', true], [':has(> .missing)', false],
          [':has(+ .hit)', false], [':has(+ aside)', true],
          [':has(~ article.hit[data-ok]:empty)', true], [':has(~ .decoy)', false],
          [':has(~ #scope)', false], [':has(> .missing, + .missing, ~ .hit)', true],
        ]) {
          assert.equal($('#scope').is(selector), expected, selector);
          assert.deepEqual(ids($('section' + selector)), expected ? ['scope'] : [], selector);
          assert.deepEqual(ids($('section').filter(selector)), expected ? ['scope'] : [], 'filter ' + selector);
        }
      } finally { $.dispose(); }
    });

    test(`relative has preserves chains, nested lists and query scopes (${label})`, () => {
      const $ = loader(source, options), reference = cheerio(source, { xml });
      const selectors = [
        ':has(> div .decoy)', ':has(+ aside > .decoy)', ':has(~ article + p)',
        ':has(.decoy)', ':has(> :is(.hit))', ':has(+ :is(aside))',
        ':has(~ :not(.hit))', ':has(> div:has(> i))',
        ':has(+ aside:not(main aside))', ':has(> div :is(main i))',
        ':has(> .missing, + aside > .decoy)', ':has(+ :is(.missing), ~ article.hit)',
      ];
      try {
        for (const selector of selectors) {
          assert.equal($('#scope').is(selector), reference('#scope').is(selector), selector);
          assert.deepEqual(ids($(selector)), ids(reference(selector)), 'document ' + selector);
          for (const context of ['#root', '#scope', '#scope, #next'])
            assert.deepEqual(ids($(context).find(selector)), ids(reference(context).find(selector)), context + ' ' + selector);
        }
        assert.deepEqual(ids($('#root').find('section:has(+ aside .decoy) > i')), ['direct']);
      } finally { $.dispose(); }
    });

    test(`relative has observes moved children and siblings through retained selections (${label})`, () => {
      const trace = factory => {
        const $ = factory(source, options), scope = $('#scope'), next = $('#next');
        const selectors = [':has(> .hit)', ':has(+ .hit)', ':has(~ .hit)', ':has(+ aside .decoy)'];
        const read = () => selectors.map(selector => scope.is(selector));
        try {
          const records = [read()];
          $('#direct').appendTo('#child'); records.push(read());
          $('#later').insertBefore(next); records.push(read());
          $('#later').removeClass('hit'); records.push(read());
          $('#later').remove(); records.push(read());
          scope.append($('#direct')); records.push(read());
          scope.remove(); records.push(read(), ids(scope.find(':has(> i)')));
          return records;
        } finally { $.dispose?.(); }
      };
      assert.deepEqual(trace(loader), trace(cheerio));
    });

    test(`relative has preserves selector depth errors and recovery (${label})`, () => {
      const $ = loader(source, options);
      try {
        const nested = ':is('.repeat(70) + '.missing' + ')'.repeat(70);
        assert.throws(() => $('#scope').is(':has(> ' + nested + ')'), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
        assert.equal($('#scope').is(':has(> i)'), true);
        assert.throws(() => $('#scope').is(':is('.repeat(63) + ':has(> i)' + ')'.repeat(63)),
          { code: 'ERR_GROVEDOM_UNSUPPORTED' });
        assert.equal($('#scope').is(':is('.repeat(62) + ':has(> i)' + ')'.repeat(62)), true);
        assert.equal($('#scope').is(':has(+ aside)'), true);
      } finally { $.dispose(); }
    });
  }

  for (const execution of ['direct', 'buffered']) {
    test(`relative has keeps template fragments outside the child axis (${mode}, ${execution})`, () => {
      const markup = '<main><template id="t"><i id="inside" class="hit"></i></template>'
        + '<!--gap--><aside id="next"><template><b class="hit"></b></template></aside>'
        + '<article class="hit"></article></main>';
      const $ = loader(markup, { execution }), reference = cheerio(markup);
      try {
        for (const selector of [':has(> .hit)', ':has(.hit)', ':has(+ .hit)', ':has(~ .hit)',
          ':has(+ aside .hit)', ':has(> :is(.hit))'])
          assert.equal($('#t').is(selector), reference('#t').is(selector), selector);
        assert.equal($('#t').is(':has(> .hit)'), false);
        assert.equal($('#t').is(':has(.hit)'), true);
        // At the recursion limit the original walk reaches the fragment's
        // element and reports an error even though it cannot be a direct child.
        assert.throws(() => $('#t').is(':is('.repeat(63) + ':has(> i)' + ')'.repeat(63)),
          { code: 'ERR_GROVEDOM_UNSUPPORTED' });
        assert.equal($('#t').is(':is('.repeat(62) + ':has(> i)' + ')'.repeat(62)), false);
        assert.equal($('#inside').get(0).parent.parent, $('#t').get(0));
        assert.equal($.html(), reference.html());
      } finally { $.dispose(); }
    });

    test(`relative has retains XML name and attribute case (${mode}, ${execution})`, () => {
      const markup = '<Root><Group id="scope"><Item Code="AbC"/><item code="lower"/></Group>'
        + '<?gap data?><!--gap--><Item Code="Next"/><item code="later"/></Root>';
      const $ = loader(markup, { xml: true, execution });
      try {
        for (const [selector, expected] of [
          [':has(> Item[Code="AbC"])', true], [':has(> item[Code])', false],
          [':has(> Item[Code="abc" i])', true], [':has(> Item[Code="abc" s])', false],
          [':has(+ Item[Code="Next"])', true], [':has(+ item)', false],
          [':has(~ item[code="later"])', true], [':has(~ Item[code])', false],
        ]) assert.equal($('#scope').is(selector), expected, selector);
      } finally { $.dispose(); }
    });
  }
}
