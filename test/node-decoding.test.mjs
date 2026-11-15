import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { decodeInput } from '../src/wasm/node.js';

const source = '<p>' + 'x'.repeat(9000) + '</p>';

test('Uint8Array decoding preserves Buffer decoder length observations', () => {
  const input = new Uint8Array(Buffer.from(source));
  const reference = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const descriptor = Object.getOwnPropertyDescriptor(Buffer.prototype, 'length');
  let actual, expected, expectedCalls, calls = 0;
  Object.defineProperty(Buffer.prototype, 'length', { configurable: true, get() {
    calls++; return 8;
  } });
  try {
    // Follow this Node version's ordinary decoder, including its own reads.
    expected = reference.toString('utf8');
    expectedCalls = calls;
    calls = 0;
    actual = decodeInput(input, true);
  }
  finally {
    if (descriptor) Object.defineProperty(Buffer.prototype, 'length', descriptor);
    else delete Buffer.prototype.length;
  }
  assert.equal(calls, expectedCalls);
  assert.equal(actual, expected);
});

test('Buffer decoding honors a prototype decoder installed before module import', async () => {
  const input = Buffer.from(source);
  const descriptor = Object.getOwnPropertyDescriptor(Buffer.prototype, 'toString');
  let actual, calls = 0;
  Object.defineProperty(Buffer.prototype, 'toString', { ...descriptor, value(...args) {
    if (this === input) { calls++; return '<p>custom before import</p>'; }
    return Reflect.apply(descriptor.value, this, args);
  } });
  try {
    const module = new URL('../src/wasm/node.js', import.meta.url);
    module.search = '?custom-decoder-before-import';
    const { decodeInput } = await import(module.href);
    actual = decodeInput(input, true);
  } finally { Object.defineProperty(Buffer.prototype, 'toString', descriptor); }
  assert.equal(calls, 1);
  assert.equal(actual, '<p>custom before import</p>');
});
