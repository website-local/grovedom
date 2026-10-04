// Development-only instrumentation; never imported by package entries.
export function wasmDiagnostics({ profile = false, growth = false } = {}) {
    const counters = { calls: 0, pages: 0, milliseconds: 0 };
    const imports = {};
    if (profile || growth)
        imports.env = {};
    if (profile)
        imports.env.profile_now = () => performance.now() * 1e6;
    if (growth)
        Object.assign(imports.env, { growth_now: () => performance.now(), growth_sample: (pages, milliseconds) => { counters.calls++; counters.pages += pages; counters.milliseconds += milliseconds; } });
    function inspect(context) {
        const { kernel, shared, acquire, release, input, check, fail, perDocument, pool, cstring } = context;
        const live = new Set(), owners = new WeakMap();
        const statsOf = runtime => new Uint32Array(runtime.memory.buffer, runtime.gk_stats(), 5);
        let retiredAllocations = 0, peakBytes = 0;
        function stats() {
            if (shared) {
                const [liveDocuments, liveBytes, peakBytes, allocations, controlBytes] = statsOf(shared);
                return { liveDocuments, liveBytes, peakBytes, allocations, controlBytes, memoryBytes: shared.memory.buffer.byteLength };
            }
            let liveDocuments = 0, liveBytes = 0, allocations = retiredAllocations, memoryBytes = 0, controlBytes = 0;
            for (const runtime of pool) {
                allocations += statsOf(runtime)[3];
                memoryBytes += runtime.memory.buffer.byteLength;
            }
            for (const ref of live) {
                const runtime = ref.deref();
                if (!runtime)
                    continue;
                const values = statsOf(runtime);
                liveDocuments += values[0];
                liveBytes += values[1];
                allocations += values[3];
                controlBytes += values[4];
                memoryBytes += runtime.memory.buffer.byteLength;
            }
            peakBytes = Math.max(peakBytes, liveBytes);
            return { liveDocuments, liveBytes, peakBytes: peakBytes, allocations, controlBytes, memoryBytes, idleInstances: pool.length, idleMemoryBytes: context.poolBytes };
        }
        kernel.stats = stats;
        kernel.growthStats = () => ({ ...counters });
        kernel.profileParse = function (html) {
            const runtime = shared ?? acquire();
            if (!runtime.gk_parse_profile)
                throw new Error('Parsing probe requires a diagnostic build.');
            const pointer = runtime.gk_new();
            if (!pointer)
                fail('ERR_GROVEDOM_MEMORY', 'Owner allocation failed');
            const state = { runtime, pointer, bytes: null, words: null };
            try {
                input(state, html);
                check(state, runtime.gk_parse_profile(pointer));
                return runtime.memory.buffer.byteLength;
            }
            finally {
                runtime.gk_delete(pointer);
                if (perDocument)
                    release(runtime);
            }
        };
        if (profile && shared) {
            kernel.profile = () => {
                const data = new Float64Array(shared.memory.buffer, shared.gk_profile_snapshot(), shared.gk_profile_count() * 5);
                return Object.fromEntries(Array.from({ length: shared.gk_profile_count() }, (_, i) => [cstring(shared, shared.gk_profile_name(i)), Array.from(data.subarray(i * 5, i * 5 + 5))]));
            };
            kernel.profileReset = () => shared.gk_profile_reset();
            kernel.profileProbe = () => { shared.gk_profile_probe(10000); return kernel.profile(); };
        }
        return {
            create(handle, runtime) {
                const ref = new WeakRef(runtime);
                live.add(ref);
                owners.set(handle, ref);
                return ref;
            },
            dispose(handle) { live.delete(owners.get(handle)); owners.delete(handle); },
            collected(ref) { live.delete(ref); },
            retire(runtime) { retiredAllocations += statsOf(runtime)[3]; },
        };
    }
    return { imports, inspect };
}
