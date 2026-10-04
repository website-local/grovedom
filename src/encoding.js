// Every caller reserves enough UTF-8 capacity before encoding. The fallback
// supports browsers with TextEncoder but without encodeInto; Node keeps its
// native encoder and the existing fast ASCII paths.
export function createEncoder() {
    const encoder = new TextEncoder();
    if (typeof encoder.encodeInto === 'function') return encoder;
    return {
        encodeInto(value, destination) {
            const bytes = encoder.encode(value);
            destination.set(bytes);
            return { read: value.length, written: bytes.length };
        },
    };
}
