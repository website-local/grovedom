import { AsyncLocalStorage } from 'node:async_hooks';

// The engine owns the resource family through transformation AND serialization.
// Its nested srcdoc, sitemap and generated-example loads use this same adapter.
// Keep this lifecycle policy outside the synchronous DOM implementation.
export function createEngineAdapter(loadDocument) {
  const scopes = new AsyncLocalStorage();
  function load(...args) {
    const scope = scopes.getStore();
    if (!scope || scope.closed) throw new Error('DOM load requires an active engine document scope');
    const $ = loadDocument(...args);
    scope.documents.add($);
    $.load = load;
    return $;
  }
  async function run(callback) {
    const scope = { documents: new Set(), closed: false };
    return scopes.run(scope, async () => {
      try { return await callback(); }
      finally {
        scope.closed = true;
        try { for (const $ of scope.documents) $.dispose?.(); }
        finally { scope.documents.clear(); }
      }
    });
  }
  return { load, run };
}
