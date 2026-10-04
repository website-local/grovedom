// Portable UTF-8 path: no Node globals or imports. Preserve leading U+FEFF.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
export const browserPlatform = {
    bytes: buffer => new Uint8Array(buffer),
    decode: (bytes, offset, length) => decoder.decode(bytes.subarray(offset, offset + length)),
};
export const decodeInput = value => value instanceof Uint8Array ? decoder.decode(value) : value;
