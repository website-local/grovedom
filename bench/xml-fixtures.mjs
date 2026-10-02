// Authored successful XML workloads; the benchmark includes facade transfers,
// serialization and explicit disposal. Cheerio XML uses htmlparser2.
export function page(rows) {
  return '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    Array.from({ length: rows }, (_, i) => `<url data-index="${i}"><loc>https://example.test/docs/${i}?a=1&amp;b=2</loc><lastmod>2026-01-01</lastmod><priority>0.5</priority></url>`).join('') + '</urlset>';
}
export function svg(rows) {
  return '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
    Array.from({ length: rows }, (_, i) => `<g id="g${i}" class="icon"><path d="M0 0L${i} 10" fill="url(#paint)"/><use xlink:href="#g${i}"/><title>Icon ${i} &amp; label</title></g>`).join('') + '</svg>';
}
export function replay(load, source) {
  const $ = load(source, { xml: true });
  try {
    if ($('urlset').length) {
      $('loc').text((i, old) => old.replace('https://example.test/', './'));
      $('lastmod').text('2026-02-01');
      $('priority').remove();
      $('url').attr('processed', 'yes');
      $('urlset').append('<url><loc>./extra.xml</loc></url>');
    } else {
      $('linearGradient').attr('gradientUnits', 'userSpaceOnUse');
      $('use').attr('xlink:href', (i, old) => `${old}-local`);
      $('path').attr('stroke-width', '2');
      $('title').remove();
      $('svg').attr('aria-label', 'offline').append('<metadata>processed</metadata>');
    }
    return $.xml();
  } finally { $.dispose?.(); }
}
