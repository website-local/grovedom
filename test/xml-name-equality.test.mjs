import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const names = new Set(['a', 'A', 'id', 'ID', 'class', 'Class', 'xml:lang', 'é', '名', '名前']);
for (const length of [...Array.from({ length: 19 }, (_, i) => i + 1), 31, 32, 33, 63, 64, 65]) {
  const name = 'n'.repeat(length);
  names.add(name);
  for (const offset of new Set([0, Math.floor(length / 2), length - 1]))
    names.add(name.slice(0, offset) + 'x' + name.slice(offset + 1));
}
const entries = [...names];
const markup = entries.map((name, i) => `<${name} ${name}="${i}">${i}</${name}>`).join('');

for (const execution of ['buffered', 'direct']) {
  test(`XML names remain distinct across short/long shared prefixes, ${execution}`, () => {
    for (const xml of [true, { lowerCaseTags: true, lowerCaseAttributeNames: true }]) {
      const options = { xml, execution };
      const $ = load('<Root>' + markup.repeat(3) + '</Root>', options);
      const c = cheerio('<Root>' + markup.repeat(3) + '</Root>', options);
      const root = xml.lowerCaseTags ? 'root' : 'Root';
      const inspect = open => [open.xml(), open(root).children().get().map(node => [node.name, { ...node.attribs }])];
      try {
        assert.deepEqual(inspect($), inspect(c));
        for (const open of [$, c]) {
          const saved = open(root).children().slice(0, 12).remove();
          open(root).empty().append(markup).prepend(saved.clone());
          saved.attr('Changed', 'yes');
          open(root).append(saved);
          open(root).children().last()[0].name = 'n'.repeat(17);
        }
        assert.deepEqual(inspect($), inspect(c));
      } finally { $.dispose(); }
    }
  });
}
