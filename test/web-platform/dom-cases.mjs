// Adapted from WPT at the revision in sources.json (BSD-3-Clause, LICENSE.md):
// html/syntax/parsing/cdata-in-integration-point-fragment.html
// html/syntax/parsing/adoption_agency_check_the_end_tag_name.html
// dom/nodes/ParentNode-querySelector-dupe-id.html
// dom/nodes/ParentNode-querySelector-All.js (static lists)
// dom/nodes/ParentNode-querySelectorAll-case-insensitive-attribute-flag.html
export const domCases = [];
for (const [parent, names] of [['math', ['mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml']],
  ['svg', ['foreignObject', 'desc', 'title', 'path']]]) {
  for (const name of names) for (const prefix of ['', 'x']) domCases.push({
    name: `WPT CDATA in ${parent}/${name} fragment, prefix ${JSON.stringify(prefix)}`,
    expected: [[3, prefix + 'y']],
    run(load) {
      const $ = load(`<${parent}><${name}></${name}></${parent}>`);
      try {
        const node = $(parent).children().first();
        node.html(prefix + '<![CDATA[y]]>');
        return node.contents().map((_, child) => [[child.nodeType, child.data]]).get();
      } finally { $.dispose(); }
    },
  });
}
for (const prefix of ['', 'x']) domCases.push({
  name: `WPT CDATA becomes an HTML comment, prefix ${JSON.stringify(prefix)}`,
  expected: [...(prefix ? [[3, prefix]] : []), [8, '[CDATA[y]]']],
  run(load) {
    const $ = load('<div></div>');
    try {
      $('div').html(prefix + '<![CDATA[y]]>');
      return $('div').contents().map((_, child) => [[child.nodeType, child.data]]).get();
    } finally { $.dispose(); }
  },
});
const nested = '<code some-attribute=""><div><code><code><code><code></code></code></code></code></div></code>';
domCases.push({
  name: 'WPT adoption agency preserves properly nested formatting elements', expected: nested,
  run(load) {
    const $ = load('<div id="wrapper"></div>');
    try { return $('#wrapper').html(nested).html(); } finally { $.dispose(); }
  },
});
for (const connected of [false, true]) domCases.push({
  name: `WPT duplicate IDs resolve within a ${connected ? 'connected' : 'detached'} clone`,
  expected: [true, true, true, true],
  run(load) {
    const $ = load('<div id="test1"><div id="test2"></div></div>');
    try {
      const original = $('#test2')[0], clone = $('#test1').clone();
      if (connected) $('body').append(clone);
      const child = clone.find('#test2')[0];
      return [!!child, child !== original, child === clone.find('[id=test2]')[0], child === clone.find('#test2')[0]];
    } finally { $.dispose(); }
  },
});
domCases.push({
  name: 'WPT selection membership stays static across insertion and removal', expected: [2, 3, 2, true, null],
  run(load) {
    const $ = load('<main><div id="a"></div><div id="b"></div></main>');
    try {
      const before = $('main div'), first = before[0];
      $('main').append('<div id="c"></div>');
      const after = $('main div');
      $('#a').remove();
      return [before.length, after.length, $('main div').length, before[0] === first, first.parent];
    } finally { $.dispose(); }
  },
});
for (const flag of ['i', 'I']) domCases.push({
  name: `WPT attribute case flag ${flag}`, expected: 1,
  run(load) {
    const $ = load('<div class="CasE"></div>');
    try { return $(`div[class=case ${flag}]`).length; } finally { $.dispose(); }
  },
});
