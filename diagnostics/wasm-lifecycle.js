// Development-only pool observations. These hooks do not retain instances.
// The creation timer ends at runtimeCreated, before gk_init/parse. Its start is
// the kernel.create entry, so it includes that small prefix, not just the VM call.
export function wasmLifecycle({ poolSize, poolMaxBytes, eventLimit = 1024 }) {
    const identities = new WeakMap();
    let nextId = 0, context, creationStart, label = '', active = 0;
    let counts, events;
    function reset() {
        counts = { created: 0, reused: 0, retained: 0, retiredBytes: 0,
            countLimit: 0, byteLimit: 0, unpooled: 0, trimmed: 0,
            collected: 0, peakLiveDocuments: active, peakIdleBytes: context?.poolBytes ?? 0,
            initialBytes: 0, instancePrefixMilliseconds: 0, timedCreations: 0, omittedEvents: 0 };
        events = [];
    }
    reset();
    function record(action, runtime) {
        const event = { action, label, instance: identities.get(runtime.memory), bytes: runtime.memory.buffer.byteLength };
        if (events.length < eventLimit) events.push(event);
        else counts.omittedEvents++;
    }
    return {
        runtimeCreated(runtime) {
            const elapsed = creationStart === undefined ? null : performance.now() - creationStart;
            identities.set(runtime.memory, ++nextId);
            counts.created++;
            counts.initialBytes += runtime.memory.buffer.byteLength;
            if (elapsed !== null) { counts.instancePrefixMilliseconds += elapsed; counts.timedCreations++; }
            record('create', runtime);
        },
        attach(value) {
            context = value;
            const { kernel, pool } = context, create = kernel.create;
            kernel.create = function (...args) {
                const previous = creationStart;
                creationStart = performance.now();
                try { return create.apply(this, args); }
                finally { creationStart = previous; }
            };
            const pop = pool.pop, push = pool.push;
            pool.pop = function () {
                const runtime = pop.call(this);
                if (runtime) { counts.reused++; record('reuse', runtime); }
                return runtime;
            };
            pool.push = function (runtime) {
                counts.retained++;
                counts.peakIdleBytes = Math.max(counts.peakIdleBytes, context.poolBytes + runtime.memory.buffer.byteLength);
                record('retain', runtime);
                return push.call(this, runtime);
            };
            kernel.lifecycleStats = () => ({ ...counts, activeDocuments: active,
                idleInstances: pool.length, idleBytes: context.poolBytes, events: events.map(event => ({ ...event })) });
            kernel.lifecycleReset = reset;
            kernel.lifecycleLabel = value => { label = String(value); };
        },
        create() { active++; counts.peakLiveDocuments = Math.max(counts.peakLiveDocuments, active); },
        dispose() { active--; },
        collected() { active--; counts.collected++; },
        retire(runtime) {
            let reason;
            if (context.pool.includes(runtime)) reason = 'trimmed';
            else if (context.heap !== 'pool') reason = 'unpooled';
            else if (context.pool.length >= poolSize) reason = 'countLimit';
            else if (runtime.memory.buffer.byteLength > poolMaxBytes - context.poolBytes) reason = 'byteLimit';
            else throw new Error('Unexpected Wasm retirement');
            counts[reason]++;
            counts.retiredBytes += runtime.memory.buffer.byteLength;
            record(reason, runtime);
        },
    };
}
