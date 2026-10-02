// Real installed engine + tracked MDN transforms; deterministic resource I/O.
// The snapshot is produced by scripts/prepare-consumer.mjs.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const snapshot = process.env.GROVEDOM_CONSUMER_SNAPSHOT;
if (!snapshot) throw new Error('Set GROVEDOM_CONSUMER_SNAPSHOT');
const moduleAt = path => import(pathToFileURL(resolve(snapshot, path)).href);
const { run } = await moduleAt('adapter.mjs');
const { processHtml } = await moduleAt('engine/lib/life-cycle/process-html.js');
const { processSvg } = await moduleAt('engine/lib/life-cycle/process-svg.js');
const { processSiteMap } = await moduleAt('engine/lib/life-cycle/process-site-map.js');
const { processHtmlMetaRefresh } = await moduleAt('engine/lib/life-cycle/process-html-meta.js');
const { getResourceBodyFromHtml } = await moduleAt('engine/lib/life-cycle/save-html-to-disk.js');
const { preProcessHtml, postProcessHtml } = await moduleAt('mdn/mdn/process-html/index.js');
const interactive = await moduleAt('mdn/mdn/process-html/process-interactive-examples.js');

export const fixtures = [
  { id: 'engine-html', source: '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/next"><style>p{background:url(/tile.png)}</style></head><body><a href="/next">next</a><img srcset="/one.png 1x, /two.png 2x"><iframe srcdoc="&lt;p&gt;&lt;img src=&quot;/inner.png&quot;&gt;&lt;/p&gt;"></iframe></body></html>' },
  { id: 'engine-svg', type: 6, xml: true, source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><image href="/one.png"/><use xlink:href="/icons.svg#one"/></svg>' },
  { id: 'engine-sitemap', type: 5, source: '<?xml version="1.0"?><urlset><url><loc>https://example.test/a</loc></url><url><loc>https://example.test/a</loc></url><url><loc>https://example.test/b</loc></url></urlset>' },
  { id: 'mdn-playable', url: 'https://developer.mozilla.org/mdn-github-io/example', source: '<section class="preview"><img src="/sample.png"></section><textarea class="playable-html">&lt;img src="/sample.png"&gt;</textarea><style class="editable">p{color:red}</style><textarea class="playable-css">p{color:red}</textarea>' },
  { id: 'mdn-bcd-missing', source: '<main><mdn-compat-table-lazy query="api.Example" locale="en-US"></mdn-compat-table-lazy></main>' },
  { id: 'mdn-bcd-render', source: '<main><mdn-compat-table-lazy query="api.Example" locale="en-US"></mdn-compat-table-lazy></main>', resources: {
    'https://developer.mozilla.org/bcd/api/v0/current/api.Example.json': JSON.stringify({
      data: { __compat: { support: { chrome: { version_added: '1' } } }, child: { __compat: { support: { chrome: { version_added: '2' } } } } },
      browsers: { chrome: { name: 'Chrome', type: 'desktop', releases: { '1': { status: 'retired' }, '2': { status: 'current' } } } },
    }),
  } },
  { id: 'mdn-generated-example', source: '<main><section><h2 id="example">Example</h2><div class="code-example"><pre class="brush: html">&lt;img src="/sample.png"&gt;</pre></div><iframe data-live-id="example" data-live-path="/en-US/docs/example/"></iframe></section><script type="module" src="/main.js"></script></main>' },
];

export async function replay(source, scenario = {}) {
  return run(async () => {
    const events = [], outputs = [];
    const options = { encoding: { 2: 'utf8', 5: 'utf8', 6: 'utf8' }, meta: { locale: 'en-US', host: 'developer.mozilla.org' }, cheerioParse: scenario.xml ? { xml: true } : undefined };
    const url = scenario.url ?? 'https://developer.mozilla.org/en-US/docs/example';
    function resource(type, depth, link, parentUrl = url) {
      const target = new URL(link, parentUrl);
      return { type, depth, url: target.href, rawUrl: link, downloadLink: target.href, localRoot: 'offline',
        savePath: target.hostname + target.pathname, replacePath: './offline' + target.pathname + target.search + target.hash,
        encoding: options.encoding[type] ?? null, meta: {} };
    }
    const submit = value => { for (const res of Array.isArray(value) ? value : [value]) events.push(['submit', res.type, res.url, res.replacePath]); };
    const pipeline = {
      async linkRedirect(link, element, parent) {
        if (/^(?:#|data:|javascript:|mailto:)/i.test(link)) return;
        const result = new URL(link, parent.url).href;
        events.push(['link', result]); return result;
      },
      async detectResourceType(link, type) { return type; },
      async createResource(type, depth, link, refUrl) { return resource(type, depth, link, refUrl); },
      async processBeforeDownload(res) { return res; },
      async createAndProcessResource(link, type, depth, element, parent) {
        const redirected = await this.linkRedirect(link, element, parent);
        return redirected ? resource(type, depth, redirected) : undefined;
      },
      async download(res) {
        events.push(['download', res.url]);
        if (scenario.resources && Object.hasOwn(scenario.resources, res.url)) res.body = scenario.resources[res.url];
        else if (!res.url.includes('/bcd/api/')) throw new Error(`Missing offline replay body: ${res.url}`);
        // No BCD body deliberately exercises MDN's missing-data rendering.
        return res;
      },
      async processAfterDownload(res) { return transform(res); },
    };
    async function transform(res) {
      if (res.type === 2) {
        await preProcessHtml(res, submit, options, pipeline);
        interactive.preProcessInteractiveExample(res.meta.doc, res);
        await processHtml(res, submit, options, pipeline);
        await processHtmlMetaRefresh(res, submit, options, pipeline);
        postProcessHtml(res.meta.doc, res);
        interactive.postProcessInteractiveExample(res.meta.doc, res);
      } else if (res.type === 6) await processSvg(res, submit, options, pipeline);
      else if (res.type === 5) await processSiteMap(res, submit, options, pipeline);
      res.body = getResourceBodyFromHtml(res, options);
      outputs.push([res.url, String(res.body)]);
      return res;
    }
    const res = resource(scenario.type ?? 2, 0, url);
    res.body = source;
    await transform(res);
    return JSON.stringify({ outputs, events });
  });
}
