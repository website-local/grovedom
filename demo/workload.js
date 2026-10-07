// Authored workload shared with the local benchmarks, CI and browser demo.
export const cases = [120, 600].map(rows => ({ id: `articles-${rows}`, rows }));
export function page(count = 120) {
  let rows = '';
  for (let i = 0; i < count; i++) {
    rows += `<article class="item" data-i="${i}"><h2>Item ${i}</h2><a href="/page/${i}" class="link">Read ${i}</a><img src="/image/${i}.png"><pre class="example"><code>&lt;p&gt;Example ${i}&lt;/p&gt;</code></pre><span class="obsolete">old</span></article>`;
  }
  return `<!DOCTYPE html><html><head><title>Replay</title></head><body><main>${rows}</main></body></html>`;
}

// Includes parse, repeated query/traversal, callbacks, mutations, serialization,
// and deterministic disposal where available. This is not the full engine replay.
export function replay(load, source) {
  const $ = load(source);
  try {
    $('a[href]').each(function (i) {
      const node = $(this);
      node.attr('href', `/offline${node.attr('href')}`).attr('data-order', i).attr('rel', 'local');
    });
    $('img[src]').attr('loading', 'lazy').attr('decoding', 'async');
    $('.example').each(function () { const node = $(this); node.html(node.text()); });
    $('.obsolete').remove();
    $('article').find('h2').attr('data-heading', 'yes');
    $('main').append('<footer>Done</footer>');
    return $.html();
  } finally { $?.dispose?.(); }
}

export { replay as transform };
