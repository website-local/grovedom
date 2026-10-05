// Shared by Node tests and the browser correctness page. Expected results come
// from the pinned WPT fixtures, never from GroveDOM or a second parser at runtime.
export function selectorResult(load, fixture, row, context) {
  const $ = load(fixture);
  let fragment;
  try {
    let query = selector => $(selector);
    if (context !== 'document') {
      let root = $('#root');
      if (context === 'detached') root = root.detach();
      if (context === 'fragment') {
        fragment = load(root.html(), {}, false);
        query = selector => fragment(selector);
      } else query = selector => root.find(selector);
    }
    const found = query(row.selector), again = query(row.selector);
    return { ids: found.map((_, node) => node.attribs.id).get(),
      stable: found.get().every((node, index) => node === again[index]),
      unique: new Set(found.get()).size === found.length };
  } finally { fragment?.dispose(); $.dispose(); }
}

export function escapeResult(load, row) {
  const $ = load('<div><span></span></div>');
  try {
    const child = $('span').attr('id', row.id)[0];
    const found = $('div').find(row.selector);
    return { count: found.length, identity: found.length ? found[0] === child : true };
  } finally { $.dispose(); }
}

export function* selectorCases(selectors) {
  for (const row of selectors) {
    // Keep one visible skip for an excluded upstream record, rather than hiding
    // it at import time or counting it as a passing assertion.
    for (const context of row.skip ? ['excluded'] : row.contexts)
      yield { row: { ...row, skip: row.skip ?? row.contextSkips?.[context] }, context,
        name: `WPT ${row.id} ${context}: ${row.name} (${row.selector})` };
  }
}
