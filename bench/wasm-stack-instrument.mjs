// Diagnostic binary instrumentation using the existing LLVM disassembler.
// Observe every write to the linear-memory stack pointer without adding C
// frames or modifying Lexbor. The returned module must never be timed/shipped.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const unsigned = value => {
  const bytes = [];
  do { const byte = value & 127; value >>>= 7; bytes.push(byte | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
};
const signed = value => {
  const bytes = [];
  for (;;) {
    const byte = value & 127; value >>= 7;
    const done = (value === 0 && !(byte & 64)) || (value === -1 && (byte & 64));
    bytes.push(byte | (done ? 0 : 128));
    if (done) return Buffer.from(bytes);
  }
};
function integer(data, cursor) {
  let value = 0, shift = 0, byte;
  do {
    assert.ok(cursor.offset < data.length && shift < 35, 'Invalid unsigned LEB');
    byte = data[cursor.offset++]; value |= (byte & 127) << shift; shift += 7;
  } while (byte & 128);
  return value >>> 0;
}

export function instrumentStack(file, stackBytes) {
  assert.ok(Number.isSafeInteger(stackBytes) && stackBytes > 0 && stackBytes < 0x80000000, 'Expected a positive stack reservation below 2 GiB');
  const data = readFileSync(file), original = new WebAssembly.Module(data);
  assert.equal(WebAssembly.Module.imports(original).length, 0, 'Use an import-free stack diagnostic build.');
  const cursor = { offset: 8 }, sections = [];
  while (cursor.offset < data.length) {
    const id = data[cursor.offset++], size = integer(data, cursor), start = cursor.offset;
    assert.ok(start + size <= data.length);
    sections.push({ id, start, body: data.subarray(start, start + size) }); cursor.offset += size;
  }
  const globals = sections.find(s => s.id === 6), exports = sections.find(s => s.id === 7);
  assert.ok(globals && exports);
  const gc = { offset: 0 }, minimum = integer(globals.body, gc);
  globals.body = Buffer.concat([unsigned(minimum + 1), globals.body.subarray(gc.offset), Buffer.from([0x7f, 1, 0x41]), signed(stackBytes), Buffer.from([0x0b])]);
  const ec = { offset: 0 }, count = integer(exports.body, ec), entriesStart = ec.offset;
  let pointer;
  for (let i = 0; i < count; i++) {
    const length = integer(exports.body, ec), name = exports.body.toString('utf8', ec.offset, ec.offset + length);
    ec.offset += length;
    const kind = exports.body[ec.offset++], index = integer(exports.body, ec);
    assert.notEqual(name, '__stack_minimum', 'Module already instrumented');
    if (name === '__stack_pointer') { assert.equal(kind, 3); pointer = index; }
  }
  assert.notEqual(pointer, undefined, 'Export the stack pointer in the diagnostic build.');
  const name = Buffer.from('__stack_minimum');
  exports.body = Buffer.concat([unsigned(count + 1), exports.body.subarray(entriesStart), unsigned(name.length), name, Buffer.from([3]), unsigned(minimum)]);
  const disassembly = execFileSync(process.env.LLVM_OBJDUMP ?? 'llvm-objdump', ['-d', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const writes = [];
  for (const line of disassembly.split('\n')) {
    const match = /^\s*([0-9a-f]+):\s+((?:[0-9a-f]{2}[ \t]+)+)global\.set[ \t]+(\d+)/.exec(line);
    if (!match || Number(match[3]) !== pointer) continue;
    const offset = parseInt(match[1], 16), bytes = Buffer.from(match[2].trim().split(/\s+/).map(v => parseInt(v, 16)));
    assert.ok(data.subarray(offset, offset + bytes.length).equals(bytes), 'Disassembly offsets must match file bytes');
    assert.equal(data[offset], 0x24);
    const check = { offset: offset + 1 }; assert.equal(integer(data, check), pointer); assert.equal(check.offset, offset + bytes.length);
    writes.push({ offset, length: bytes.length });
  }
  assert.ok(writes.length > 0, 'No stack-pointer writes found');
  // global.get sp; global.get min; i32.lt_u; if void; get sp; set min; end.
  const hook = Buffer.concat([Buffer.from([0x23]), unsigned(pointer), Buffer.from([0x23]), unsigned(minimum), Buffer.from([0x49, 0x04, 0x40, 0x23]), unsigned(pointer), Buffer.from([0x24]), unsigned(minimum), Buffer.from([0x0b])]);
  const code = sections.find(s => s.id === 10), cc = { offset: 0 }, functions = integer(code.body, cc);
  const bodies = [unsigned(functions)]; let applied = 0;
  for (let i = 0; i < functions; i++) {
    const length = integer(code.body, cc), start = cc.offset, end = start + length, parts = [];
    let copied = start;
    for (const write of writes) {
      const position = write.offset - code.start;
      if (position < start || position >= end) continue;
      assert.ok(position + write.length <= end);
      parts.push(code.body.subarray(copied, position + write.length), hook);
      copied = position + write.length; applied++;
    }
    parts.push(code.body.subarray(copied, end));
    const body = Buffer.concat(parts); bodies.push(unsigned(body.length), body); cc.offset = end;
  }
  assert.equal(applied, writes.length); assert.equal(cc.offset, code.body.length);
  code.body = Buffer.concat(bodies);
  const binary = Buffer.concat([data.subarray(0, 8), ...sections.flatMap(s => [Buffer.from([s.id]), unsigned(s.body.length), s.body])]);
  assert.ok(WebAssembly.validate(binary), 'Instrumented module must validate');
  return { binary, sites: applied };
}
