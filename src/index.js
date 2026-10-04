import { kernel } from './kernel.js';
import { expandSelector } from './selectors.js';

const selections = new WeakMap();
const nodes = {
  get(value) { return NodeHandle.record(value); },
  has(value) { return NodeHandle.record(value) !== undefined; },
};
const encoder = new TextEncoder();
const empty = new Uint32Array();
const boolAttributes = new Set('autofocus autoplay async checked controls defer disabled hidden ismap loop multiple open readonly required scoped selected'.split(' '));
const numericKey = /^(0|[1-9][0-9]*)$/;
const selectionProxy = {
  get(target, key, receiver) {
    if (typeof key === 'string' && numericKey.test(key)) return target.get(Number(key));
    return Reflect.get(target, key, receiver);
  },
  set(target, key, value, receiver) {
    if (typeof key === 'string' && numericKey.test(key)) {
      const data = entry(target), ids = inputIds(data.state, value);
      if (Number(key) >= data.ids.length || ids.length !== 1) throw new TypeError('Expected an existing selection index and one node');
      // Selections created by slice/eq can share storage until explicitly edited.
      data.ids = data.ids.slice(); data.ids[Number(key)] = ids[0]; return true;
    }
    return Reflect.set(target, key, value, receiver);
  },
  has(target, key) { return typeof key === 'string' && numericKey.test(key) ? Number(key) < entry(target).ids.length : Reflect.has(target, key); },
  ownKeys(target) { return [...Array.from({ length: entry(target).ids.length }, (_, i) => String(i)), ...Reflect.ownKeys(target)]; },
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === 'string' && numericKey.test(key) && Number(key) < entry(target).ids.length) return { configurable: true, enumerable: true, value: target.get(Number(key)) };
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
};

function unsupported(message) {
  const error = new Error(message);
  error.code = 'ERR_GROVEDOM_UNSUPPORTED';
  throw error;
}
function alive(state) {
  if (state.closed) {
    const error = new Error('Document has been disposed');
    error.code = 'ERR_GROVEDOM_DISPOSED';
    throw error;
  }
}
function entry(selection) {
  const value = selections.get(selection) ?? Selection.state(selection);
  if (!value) throw new TypeError('Expected a GroveDOM selection');
  alive(value.state);
  return value;
}
function commandViews(state, length, bytes) {
  // Repeated scalar callbacks usually submit the same command/value lengths.
  // Keep one view per buffer, refreshing after growth or a changed used range.
  if (!state.usedWords || state.usedWords.buffer !== state.words.buffer || state.usedWords.length !== length)
    state.usedWords = state.words.subarray(0, length);
  if (!state.usedPayload || state.usedPayload.buffer !== state.payload.buffer || state.usedPayload.length !== bytes)
    state.usedPayload = state.payload.subarray(0, bytes);
}
function flush(state) {
  alive(state);
  if (!state.wordLength) return;
  const length = state.wordLength, bytes = state.byteLength;
  // A failure discards unexecuted commands. Never retry already applied writes.
  state.wordLength = state.byteLength = 0;
  commandViews(state, length, bytes);
  kernel.execute(state.owner, state.usedWords, state.usedPayload);
}
function grow(buffer, required) {
  if (required > 0xffffffff) throw new RangeError('Command buffer exceeds the prototype limit');
  if (required <= buffer.length) return buffer;
  let size = Math.max(256, buffer.length);
  while (size < required) size = Math.min(size * 2, 0xffffffff);
  const next = new buffer.constructor(size);
  next.set(buffer);
  return next;
}
function encode(value, payload, offset) {
  // Names and short attribute values usually fit this path. Avoid allocating a
  // view and TextEncoder result object for every small ASCII operand.
  if (value.length <= 64) {
    let i = 0;
    for (; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 0x7f) break;
      payload[offset + i] = code;
    }
    if (i === value.length) return i;
  }
  return encoder.encodeInto(value, payload.subarray(offset)).written;
}
function enqueue(state, ids, op, a = '', b = '') {
  alive(state);
  if (!ids.length) return;
  // Bound retained batching storage. One large command can exceed this threshold.
  if (state.wordLength + ids.length + 6 > 16384 || state.byteLength + 3 * (a.length + b.length) > 65536) flush(state);
  state.words = grow(state.words, state.wordLength + 6 + ids.length);
  state.payload = grow(state.payload, state.byteLength + 3 * (a.length + b.length));
  const ao = state.byteLength;
  const al = encode(a, state.payload, ao);
  const bo = ao + al;
  const bl = encode(b, state.payload, bo);
  const offset = state.wordLength, words = state.words;
  words[offset] = op; words[offset + 1] = ids.length;
  words[offset + 2] = ao; words[offset + 3] = al;
  words[offset + 4] = bo; words[offset + 5] = bl;
  words.set(ids, offset + 6);
  state.wordLength += 6 + ids.length;
  state.byteLength = bo + bl;
  if (state.direct) flush(state);
}
function read(state, ids, operation, name = '') {
  alive(state);
  const nodes = ids.length === 1 ? ids[0] : ids;
  if (state.wordLength) {
    const length = state.wordLength, bytes = state.byteLength;
    state.wordLength = state.byteLength = 0;
    commandViews(state, length, bytes);
    return kernel.observe(state.owner, operation, nodes, name, state.usedWords, state.usedPayload);
  }
  return kernel.read(state.owner, operation, nodes, name);
}
function query(state, selector, roots, match = false) {
  if (typeof selector !== 'string') unsupported('Only string CSS selectors are supported here.');
  flush(state);
  // Keep ordinary CSS on the direct kernel path. These common Cheerio suffixes
  // apply to the matched selection, rather than to sibling position in the DOM.
  if (selector.includes(':')) {
    const suffix = /:(first|last|even|odd)$|:(eq|nth|lt|gt)\((-?\d+)\)$/.exec(selector);
    if (suffix) {
      const ids = query(state, selector.slice(0, suffix.index) || '*', roots, match);
      const kind = suffix[1] ?? suffix[2];
      let index = Number(suffix[3]); if (index < 0) index += ids.length;
      if (kind === 'first') return ids.slice(0, 1);
      if (kind === 'last') return ids.slice(-1);
      if (kind === 'eq' || kind === 'nth') return index >= 0 && index < ids.length ? ids.slice(index, index + 1) : empty;
      return ids.filter((_, i) => kind === 'even' ? i % 2 === 0 : kind === 'odd' ? i % 2 === 1 : kind === 'lt' ? i < index : i > index);
    }
    let expanded = state.selectorAliases?.get(selector);
    if (expanded === undefined) {
      expanded = expandSelector(selector);
      state.selectorAliases ??= new Map();
      if (state.selectorAliases.size === 32) state.selectorAliases.clear();
      state.selectorAliases.set(selector, expanded);
    }
    selector = expanded;
  }
  const first = selector.charCodeAt(0);
  if (first === 62 || first === 43 || first === 126 || selector.startsWith(':scope') || first <= 32) {
    const relative = relativeQuery(state, selector.trimStart(), roots, match);
    if (relative !== null) return relative;
  }
  return kernel.query(state.owner, selector, roots, match);
}

// Scan only the relative-selector path. Brackets, arguments, quotes and CSS
// escapes keep embedded combinators from becoming traversal boundaries.
function selectorBoundary(selector, separators) {
  let depth = 0, quote = '';
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (!depth && separators.includes(char)) return i;
  }
  return selector.length;
}
function relativeQuery(state, selector, roots, match) {
  if (!/^(?:[>+~]|:scope\b)/.test(selector)) return null;
  if (match) unsupported('Relative selectors in filter/is are not supported.');
  roots = kernel.query(state.owner, '*', roots, true);
  const comma = selectorBoundary(selector, ',');
  if (comma < selector.length) {
    if (selector[0] !== '+' && selector[0] !== '~' && /^[+~]/.test(selector.slice(comma + 1).trimStart())) unsupported('Mixed child/sibling relative selector lists are not supported.');
    const left = query(state, selector.slice(0, comma), roots), right = query(state, selector.slice(comma + 1).trimStart(), roots);
    const both = new Uint32Array(left.length + right.length); both.set(left); both.set(right, left.length);
    return edit(state, 13, both);
  }
  let candidates, rest;
  if (selector.startsWith(':scope')) {
    candidates = roots; rest = selector.slice(6);
    const end = selectorBoundary(rest, ' >+~\t\r\n\f');
    if (end) { candidates = query(state, rest.slice(0, end), candidates, true); rest = rest.slice(end); }
  } else {
    const axis = selector[0] === '>' ? 1 : selector[0] === '+' ? 4 : 6;
    candidates = kernel.traverse(state.owner, roots, axis);
    rest = selector.slice(1).trimStart();
    const end = selectorBoundary(rest, ' >+~\t\r\n\f');
    candidates = query(state, rest.slice(0, end) || '*', candidates, true); rest = rest.slice(end);
  }
  rest = rest.trimStart();
  return rest ? query(state, rest, candidates) : candidates;
}
function selection(state, ids, previous) {
  const value = { state, ids, previous };
  const target = new Selection(value);
  const proxy = new Proxy(target, selectionProxy);
  selections.set(proxy, value);
  return proxy;
}
function edit(state, operation, ids = empty, other = empty, text = '') {
  flush(state);
  return kernel.edit(state.owner, operation, ids, other, text);
}
function attributes(state, ids) { const value = read(state, ids, 7); return value === undefined ? undefined : JSON.parse(value); }
function attributeValue(state, ids, name) {
  const result = read(state, ids, 1, name);
  if (result === undefined && name === 'value' && ids.length) {
    const tag = read(state, ids, 5);
    if (tag === 'option') return read(state, ids.subarray(0, 1), 2);
    if (tag === 'input' && ['checkbox', 'radio'].includes(read(state, ids, 1, 'type'))) return 'on';
  }
  return !state.xml && result !== undefined && boolAttributes.has(name.toLowerCase()) ? name.toLowerCase() : result;
}
function rawAxis(node, axis) {
  const { state, ids } = nodes.get(node);
  flush(state);
  const result = kernel.traverse(state.owner, ids, axis);
  return result.length ? wrap(state, result[0]) : null;
}
function wrap(state, id) {
  alive(state);
  let node = state.wrappers.get(id);
  if (!node) {
    node = Object.freeze(new NodeHandle(state, id));
    state.wrappers.set(id, node);
  }
  return node;
}
function inputIds(state, input) {
  const value = selections.get(input) ?? nodes.get(input);
  if (value) {
    alive(value.state);
    if (value.state !== state) throw new TypeError('Nodes belong to another document');
    return value.ids;
  }
  if (Array.isArray(input)) {
    const ids = new Uint32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const value = nodes.get(input[i]);
      if (!value || value.state !== state) throw new TypeError('Expected nodes from this document');
      ids[i] = value.ids[0];
    }
    return ids;
  }
  throw new TypeError('Expected a selector, node handle, or selection');
}

class XMLNodeRecord {
  #ids;
  constructor(state, id) { this.state = state; this.id = id; }
  get ids() { return this.#ids ??= Uint32Array.of(this.id); }
}

function callbackIds(state, node) {
  const record = nodes.get(node);
  alive(state);
  // Borrow this only for the immediate read/enqueue. Reacquire after calling
  // user code (including string coercion), which can reenter another callback.
  const ids = state.callbackIds ??= new Uint32Array(1);
  ids[0] = record.id;
  return ids;
}

function xmlAttributeCallback(target, state, name, value) {
  return target.each(function (i, node) {
    const next = value.call(node, i, attributeValue(state, callbackIds(state, node), name));
    if (next !== undefined) alive(state);
    if (typeof next === 'function') selection(state, nodes.get(node).ids).attr(name, next);
    else if (next !== undefined) {
      const text = next === null ? '' : String(next);
      enqueue(state, callbackIds(state, node), next === null ? 2 : 1, name, text);
    }
  });
}

function xmlTextCallback(target, state, value) {
  return target.each(function (i, node) {
    const next = value.call(node, i, read(state, callbackIds(state, node), 2));
    alive(state);
    if (typeof next === 'function') selection(state, nodes.get(node).ids).text(next);
    else if (next !== undefined) {
      const text = String(next);
      enqueue(state, callbackIds(state, node), 3, text);
    }
  });
}

class NodeHandle {
  #record;
  constructor(state, id) { this.#record = state.xml ? new XMLNodeRecord(state, id) : { state, ids: Uint32Array.of(id) }; }
  static record(value) { return value !== null && typeof value === 'object' && #record in value ? value.#record : undefined; }
  get name() { const { state, ids } = nodes.get(this); return read(state, ids, 5); }
  get type() {
    const { state, ids } = nodes.get(this);
    const type = read(state, ids, 6);
    if (type === 1) { if (state.xml) return 'tag'; const name = read(state, ids, 5); return name === 'script' || name === 'style' ? name : 'tag'; }
    return ({ 3: 'text', 4: 'cdata', 7: 'directive', 8: 'comment', 9: 'root', 10: 'directive', 11: 'root' })[type];
  }
}

class Selection {
  #state;
  constructor(state) { this.#state = state; }
  static state(target) { return #state in target ? target.#state : undefined; }
  get cheerio() { return '[cheerio object]'; }
  get length() { return entry(this).ids.length; }
  get(index) {
    const { state, ids } = entry(this);
    if (index === undefined) return this.toArray();
    if (!Number.isInteger(index)) return undefined;
    if (index < 0) index += ids.length;
    return index >= 0 && index < ids.length ? wrap(state, ids[index]) : undefined;
  }
  toArray() { return Array.from(this); }
  *[Symbol.iterator]() {
    const { state, ids } = entry(this);
    for (const id of ids) yield wrap(state, id);
  }
  eq(index) {
    const { state, ids } = entry(this);
    index = Number(index);
    if (!Number.isInteger(index)) return selection(state, empty, this);
    if (index < 0) index += ids.length;
    return selection(state, index >= 0 && index < ids.length ? ids.subarray(index, index + 1) : empty, this);
  }
  first() { return this.eq(0); }
  last() { return this.eq(-1); }
  slice(start, end) { const { state, ids } = entry(this); return selection(state, ids.subarray(start, end), this); }
  splice(start, deleteCount, ...items) {
    const record = entry(this);
    if (!arguments.length) return [];
    const ids = Array.from(record.ids);
    const removed = arguments.length === 1 ? ids.splice(start) : ids.splice(start, deleteCount, ...inputIds(record.state, items));
    record.ids = Uint32Array.from(ids);
    return removed.map(id => wrap(record.state, id));
  }
  find(selector) {
    const { state, ids } = entry(this);
    if (!selector) return selection(state, empty, this);
    if (typeof selector !== 'string') {
      const roots = this.toArray();
      return state.api(selector).filter((i, node) => roots.some(root => state.api.contains(root, node)));
    }
    return selection(state, query(state, selector, ids), this);
  }
  children(selector) { return this._traverse(1, selector); }
  parent(selector) { return this._traverse(2, selector); }
  contents() { return this._traverse(3); }
  _traverse(axis, selector) {
    const { state, ids } = entry(this);
    flush(state);
    let resultIds = kernel.traverse(state.owner, ids, axis);
    if ((axis === 8 || axis === 9) && ids.length > 1) { resultIds = edit(state, 13, resultIds); if (axis === 9) resultIds.reverse(); }
    const result = selection(state, resultIds, this);
    return selector === undefined ? result : result.filter(selector);
  }
  each(callback) {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    const { state, ids } = entry(this);
    for (let i = 0; i < ids.length; i++) {
      // The callback receives a snapshot identity. Its first DOM read flushes
      // pending writes, so callback entry itself need not cross the binding.
      const node = wrap(state, ids[i]);
      if (callback.call(node, i, node) === false) break;
    }
    return this;
  }
  filter(selector) {
    const { state, ids } = entry(this);
    if (!selector) return selection(state, empty, this);
    if (typeof selector === 'string') return selection(state, query(state, selector, ids, true), this);
    if (typeof selector !== 'function') {
      const wanted = new Set(inputIds(state, selector));
      return selection(state, ids.filter(id => wanted.has(id)), this);
    }
    const result = new Uint32Array(ids.length);
    let length = 0;
    this.each(function (i, node) { if (selector.call(node, i, node)) result[length++] = ids[i]; });
    return selection(state, result.subarray(0, length), this);
  }
  is(selector) {
    if (typeof selector !== 'function') return this.filter(selector).length > 0;
    let matched = false;
    this.each(function (i, node) {
      if (selector.call(node, i, node)) { matched = true; return false; }
    });
    return matched;
  }
  attr(name, value) {
    const { state, ids } = entry(this);
    if (!arguments.length) return attributes(state, ids);
    if (name && typeof name === 'object') { for (const [key, val] of Object.entries(name)) this.attr(key, val); return this; }
    if (typeof name !== 'string') unsupported('attr currently requires an attribute name.');
    if (!name || /[\s\0"'<>/=]/.test(name)) throw new TypeError('Invalid attribute name');
    if (arguments.length === 1) return attributeValue(state, ids, name);
    if (value === undefined) return this;
    if (typeof value === 'function') {
      if (state.xml) return xmlAttributeCallback(this, state, name, value);
      return this.each(function (i, node) {
        const one = nodes.get(node).ids;
        const next = value.call(node, i, attributeValue(state, one, name));
        if (next !== undefined) alive(state);
        if (typeof next === 'function') selection(state, one).attr(name, next);
        else if (next !== undefined) enqueue(state, one, next === null ? 2 : 1, name, next === null ? '' : String(next));
      });
    }
    enqueue(state, ids, value === null ? 2 : 1, name, value === null ? '' : String(value));
    return this;
  }
  removeAttr(names) {
    if (typeof names !== 'string') throw new TypeError('Expected attribute names');
    const { state, ids } = entry(this);
    for (const name of names.split(/\s+/)) if (name) enqueue(state, ids, 2, name);
    return this;
  }
  text(value) {
    const { state, ids } = entry(this);
    if (value === undefined) return read(state, ids, 2);
    if (typeof value === 'function' && state.xml) return xmlTextCallback(this, state, value);
    if (typeof value === 'function') return this.each(function (i, node) {
      const one = nodes.get(node).ids;
      const next = value.call(node, i, read(state, one, 2));
      alive(state);
      if (typeof next === 'function') selection(state, one).text(next);
      else if (next !== undefined) enqueue(state, one, 3, String(next));
    });
    enqueue(state, ids, 3, String(value));
    return this;
  }

  end() { const { state, previous } = entry(this); return previous ?? selection(state, empty); }
  map(callback) { return mapped(this, callback); }
  toString() { const { state, ids } = entry(this); return read(state, ids, 10); }
  next(selector) { return this._traverse(4, selector); }
  prev(selector) { return this._traverse(5, selector); }
  nextAll(selector) { return this._traverse(6, selector); }
  prevAll(selector) { return this._traverse(7, selector); }
  siblings(selector) { return this._traverse(8, selector); }
  parents(selector) { return this._traverse(9, selector); }
  nextUntil(stop, selector) { return until(this, 6, stop, selector); }
  prevUntil(stop, selector) { return until(this, 7, stop, selector); }
  parentsUntil(stop, selector) { return until(this, 9, stop, selector); }
  closest(selector, context) {
    const { state } = entry(this), result = [];
    if (selector) this.each(function () {
      for (let node = this; node && node !== context && node.type !== 'root'; node = node.parent) {
        if (state.api(node).is(selector)) { if (!result.includes(node)) result.push(node); break; }
      }
    });
    return selection(state, inputIds(state, result), this);
  }
  not(selector) {
    const { state, ids } = entry(this), excluded = new Set(entry(this.filter(selector)).ids);
    return selection(state, ids.filter(id => !excluded.has(id)), this);
  }
  has(selector) { const { state } = entry(this); return this.filter(function () { return state.api(this).find(selector).length > 0; }); }
  add(other, context) {
    const { state, ids } = entry(this), next = entry(state.api(other, context)).ids;
    const joined = new Uint32Array(ids.length + next.length); joined.set(ids); joined.set(next, ids.length);
    return selection(state, edit(state, 13, joined), this);
  }
  addBack(selector) { if (!entry(this).previous) return this; const previous = this.end(); return this.add(selector ? previous.filter(selector) : previous); }
  index(value) {
    const { state } = entry(this);
    if (!this.length) return -1;
    if (value === undefined) return this.first().parent().children().toArray().indexOf(this[0]);
    if (typeof value === 'string') return state.api(value).toArray().indexOf(this[0]);
    return this.toArray().indexOf(nodes.has(value) ? value : state.api(value)[0]);
  }
  hasClass(name) { return typeof name === 'string' && name.length > 0 && this.is(function () { return classTokens(this.attribs?.class ?? '').includes(name); }); }
  addClass(value) { return classes(this, 'add', value, undefined, arguments.length); }
  removeClass(value) { return classes(this, 'remove', value, undefined, arguments.length); }
  toggleClass(value, force) { return classes(this, 'toggle', value, force, arguments.length); }
  append(...values) { return content(this, 0, values); }
  prepend(...values) { return content(this, 1, values); }
  before(...values) { return content(this, 2, values); }
  after(...values) { return content(this, 3, values); }
  appendTo(target) { const { state, ids } = entry(this); return selection(state, edit(state, 3 | 256, entry(state.api(target)).ids, ids), this); }
  prependTo(target) { const { state, ids } = entry(this); return selection(state, edit(state, 4 | 256, entry(state.api(target)).ids, ids), this); }
  insertBefore(target) { const { state, ids } = entry(this); return selection(state, edit(state, 14 | 256, entry(state.api(target)).ids, ids), this); }
  insertAfter(target) { const { state, ids } = entry(this); return selection(state, edit(state, 15 | 256, entry(state.api(target)).ids, ids), this); }
  clone() { const { state, ids } = entry(this); return selection(state, edit(state, 2, ids), this); }
  empty() { const { state, ids } = entry(this); enqueue(state, ids, 7); return this; }
  remove(selector) { const { state, ids } = entry(selector ? this.filter(selector) : this); enqueue(state, ids, 6); return this; }
  detach(selector) { return this.remove(selector); }
  replaceWith(value) {
    const { state, ids } = entry(this);
    if (typeof value === 'function') return this.each(function (i, node) { state.api(node).replaceWith(value.call(node, i, node)); });
    if (typeof value === 'string') { this.before(value); this.remove(); }
    else edit(state, 7, ids, value == null ? empty : inputIds(state, value));
    return this;
  }
  html(value) {
    const { state, ids } = entry(this);
    if (value === undefined) return read(state, ids, 3);
    if (typeof value === 'function') return this.each(function (i, node) { const one = state.api(node); one.html(value.call(node, i, one.html())); });
    if (typeof value === 'string' || value === null) enqueue(state, ids, 4, value ?? '');
    else { const contentIds = inputIds(state, value); this.empty(); edit(state, 3, ids, contentIds); }
    return this;
  }
  wrapAll(wrapper) {
    const { state } = entry(this);
    if (!this.length) return this;
    if (typeof wrapper === 'function') wrapper = wrapper.call(this[0], 0, this[0]);
    const inserted = state.api(wrapper).insertBefore(this.first());
    let inner = inserted.filter(function () { return this.type === 'tag'; }).last();
    while (inner.children().length) inner = inner.children().first();
    if (inner.length) inner.append(this);
    return this;
  }
  wrap(wrapper) { return wrapping(this, wrapper, false); }
  wrapInner(wrapper) { return wrapping(this, wrapper, true); }
  unwrap(selector) {
    const { state } = entry(this);
    this.parent(selector).not('body').each(function () { const one = state.api(this); one.replaceWith(one.contents()); });
    return this;
  }
  prop(name, value) {
    const { state, ids } = entry(this);
    if (name && typeof name === 'object') { for (const [key, val] of Object.entries(name)) this.prop(key, val); return this; }
    if (value !== undefined) {
      if (typeof value === 'function') return this.each(function (i, node) { const one = state.api(node); one.prop(name, value.call(node, i, one.prop(name))); });
      if (name === 'namespace') unsupported('Changing node namespaces is not supported.');
      if (name === 'attribs') return this.each(function () { const one = state.api(this); one.removeAttr(Object.keys(one.attr() ?? {}).join(' ')); if (value) one.attr(value); });
      if (name === 'tagName' || name === 'nodeName' || name === 'name') { edit(state, 11, ids, empty, String(value)); return this; }
      if (name === 'innerHTML') return this.html(value);
      if (name === 'textContent' || name === 'innerText') return this.text(value);
      return this.attr(name, !state.xml && typeof value === 'boolean' && boolAttributes.has(name) ? value ? '' : null : value);
    }
    if (!ids.length || typeof name !== 'string') return undefined;
    if (name === 'tagName' || name === 'nodeName') return read(state, ids, 5)?.toUpperCase();
    if (name === 'innerHTML') return this.html();
    if (name === 'outerHTML') return read(state, ids, 4);
    if (name === 'textContent' || name === 'innerText') return read(state, ids.subarray(0, 1), name === 'innerText' ? 9 : 2);
    if (name === 'style') { const values = this.css(); if (!values) return undefined; const keys = Object.keys(values); return Object.assign(values, keys, { length: keys.length }); }
    if (!state.xml && boolAttributes.has(name)) return this.attr(name) !== undefined;
    if (['name', 'type', 'children', 'childNodes', 'parent', 'parentNode', 'next', 'prev', 'data', 'attribs', 'nodeType'].includes(name)) return this[0][name];
    const result = this.attr(name);
    if (result !== undefined && (name === 'href' || name === 'src') && state.baseURI) {
      const tag = read(state, ids, 5);
      if ((name === 'href' ? ['a', 'link'] : ['img', 'iframe', 'audio', 'video', 'source']).includes(tag)) { try { return new URL(result, state.baseURI).href; } catch {} }
    }
    return result;
  }
  css(name, value) {
    const { state } = entry(this);
    if (!this.length) return value === undefined ? undefined : this;
    const parse = text => {
      const style = {}; let previous;
      for (const rule of (text ?? '').split(';')) {
        const colon = rule.indexOf(':');
        if (colon < 0) { if (previous && rule.trim()) style[previous] += `;${rule.trim()}`; continue; }
        const key = rule.slice(0, colon).trim(), value = rule.slice(colon + 1).trim();
        if (key && value) { Object.defineProperty(style, key, { configurable: true, enumerable: true, writable: true, value }); previous = key; }
      }
      return style;
    };
    if (name && typeof name === 'object' && !Array.isArray(name)) { for (const [key, val] of Object.entries(name)) this.css(key, val); return this; }
    if (value === undefined) { const style = parse(this.attr('style')); return name === undefined ? style : Array.isArray(name) ? Object.fromEntries(name.filter(key => key in style).map(key => [key, style[key]])) : style[name]; }
    return this.each(function (i, node) {
      const one = state.api(node), style = parse(one.attr('style'));
      const next = typeof value === 'function' ? value.call(node, i, style[name]) : value;
      if (next === undefined) return;
      if (next === '') delete style[name]; else style[name] = String(next);
      one.attr('style', Object.entries(style).map(([key, val]) => `${key}: ${val};`).join(' '));
    });
  }
  data(name, value) {
    const { state } = entry(this);
    const get = node => {
      const id = nodes.get(node).ids[0];
      let data = state.data.get(id);
      if (!data) { data = {}; state.data.set(id, data); for (const [key, val] of Object.entries(state.api(node).attr() ?? {})) if (key.startsWith('data-')) Object.defineProperty(data, camel(key.slice(5)), { configurable: true, enumerable: true, writable: true, value: dataValue(val) }); }
      return data;
    };
    if (name && typeof name === 'object') { for (const [key, val] of Object.entries(name)) this.data(key, val); return this; }
    if (value === undefined) { if (!this.length) return undefined; const data = get(this[0]); return name === undefined ? data : data[camel(name)]; }
    return this.each(function () { Object.defineProperty(get(this), camel(name), { configurable: true, enumerable: true, writable: true, value }); });
  }
  removeData(name) { const { state } = entry(this); return this.each(function () { const id = nodes.get(this).ids[0]; if (name === undefined) state.data.delete(id); else { const data = state.data.get(id); if (data) for (const key of classTokens(name)) delete data[camel(key)]; } }); }
  val(value) {
    const { state } = entry(this);
    if (value === undefined) {
      if (!this.length) return undefined;
      const one = this.first(), name = one[0].name;
      if (name === 'textarea') return one.text();
      if (name === 'select') {
        const selected = one.find('option:selected');
        if (one.attr('multiple') !== undefined) return selected.map(function () { return state.api(this).text(); }).get();
        return selected.attr('value');
      }
      return ['input', 'button', 'option'].includes(name) ? one.attr('value') : undefined;
    }
    return this.each(function (i, node) {
      const one = state.api(node), next = typeof value === 'function' ? value.call(node, i, one.val()) : value;
      if (node.name === 'textarea') one.text(next == null ? '' : next);
      else if (node.name === 'select') {
        const values = (Array.isArray(next) ? next : [next]).map(String);
        one.find('option').each(function () { const option = state.api(this); option.attr('selected', values.includes(option.val()) ? '' : null); });
      } else if (Array.isArray(next) && ['checkbox', 'radio'].includes(one.attr('type'))) one.attr('checked', next.map(String).includes(one.val()) ? '' : null);
      else one.attr('value', next == null ? '' : String(next));
    });
  }
  serializeArray() {
    const { state } = entry(this), fields = [], result = [];
    this.each(function () { const one = state.api(this); fields.push(...(this.name === 'form' ? one.find('input,select,textarea,keygen').get() : one.get())); });
    for (const node of fields) {
      const field = state.api(node), name = field.attr('name'), type = field.attr('type') ?? '';
      if (!name || field.attr('disabled') !== undefined || !['input', 'select', 'textarea', 'keygen'].includes(node.name) || /^(?:submit|button|image|reset|file)$/i.test(type) || (/^(?:checkbox|radio)$/i.test(type) && field.attr('checked') === undefined)) continue;
      const value = field.val() ?? '';
      for (const item of Array.isArray(value) ? value : [value]) result.push({ name, value: String(item).replace(/\r?\n/g, '\r\n') });
    }
    return result;
  }
  serialize() { return this.serializeArray().map(({ name, value }) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&').replace(/%20/g, '+'); }
  extract(map) {
    const { state } = entry(this), result = {};
    for (const [key, item] of Object.entries(map)) {
      const array = Array.isArray(item), descriptor = array ? item[0] : item;
      const config = typeof descriptor === 'string' ? { selector: descriptor, value: 'textContent' } : descriptor;
      const selected = this.find(config.selector), output = [];
      (array ? selected : selected.first()).each(function (i, node) {
        const value = config.value ?? 'textContent';
        output.push(typeof value === 'function' ? value(node, key, result) : typeof value === 'object' ? state.api(node).extract(value) : state.api(node).prop(value));
      });
      result[key] = array ? output.filter(value => value != null) : output[0];
    }
    return result;
  }
}

const originalName = Object.getOwnPropertyDescriptor(NodeHandle.prototype, 'name').get;
Object.defineProperties(NodeHandle.prototype, {
  name: { get: originalName, set(value) { const { state, ids } = nodes.get(this); edit(state, 11, ids, empty, String(value)); } },
  tagName: { get: originalName, set(value) { this.name = value; } },
  nodeType: { get() { const { state, ids } = nodes.get(this); const type = read(state, ids, 6); return type === 11 ? 9 : type; } },
  parent: { get() { return rawAxis(this, 10); } },
  parentNode: { get() { return this.parent; } },
  next: { get() { return rawAxis(this, 11); } },
  nextSibling: { get() { return this.next; } },
  prev: { get() { return rawAxis(this, 12); } },
  previousSibling: { get() { return this.prev; } },
  children: { get() { const { state, ids } = nodes.get(this); return selection(state, ids).contents().toArray(); } },
  childNodes: { get() { return this.children; } },
  firstChild: { get() { return this.children[0] ?? null; } },
  lastChild: { get() { return this.children.at(-1) ?? null; } },
  data: { get() { const { state, ids } = nodes.get(this); return state.data.get(ids[0]) ?? read(state, ids, 8); }, set(value) { const { state, ids } = nodes.get(this); edit(state, 12, ids, empty, String(value)); } },
  attribs: { get() {
    const data = nodes.get(this), { state, ids } = data;
    if (read(state, ids, 6) !== 1) return undefined;
    if (!data.attribs) data.attribs = new Proxy({}, {
      get: (_, name) => typeof name === 'string' ? read(state, ids, 1, name) : undefined,
      set: (_, name, value) => { enqueue(state, ids, 1, String(name), String(value)); return true; },
      deleteProperty: (_, name) => { enqueue(state, ids, 2, String(name)); return true; },
      has: (_, name) => read(state, ids, 1, String(name)) !== undefined,
      ownKeys: () => Object.keys(attributes(state, ids)),
      getOwnPropertyDescriptor: (_, name) => { const value = read(state, ids, 1, String(name)); return value === undefined ? undefined : { configurable: true, enumerable: true, writable: true, value }; },
    });
    return data.attribs;
  } },
});

class MappedCollection extends Array {
  static get [Symbol.species]() { return Array; }
  get(index) { return index === undefined ? this.toArray() : this.at(Number(index)); }
  toArray() { return Array.from(this); }
  each(callback) { for (let i = 0; i < this.length; i++) if (callback.call(this[i], i, this[i]) === false) break; return this; }
  map(callback) { return mapped(this, callback); }
  eq(index) { const value = this.get(index); return this._next(value === undefined ? [] : [value]); }
  first() { return this.eq(0); }
  last() { return this.eq(-1); }
  slice(start, end) { return this._next(Array.prototype.slice.call(this, start, end)); }
  _next(values) { const result = Object.assign(new MappedCollection(), values); Object.defineProperty(result, 'previous', { value: this }); return result; }
  end() { return this.previous; }
}
function mapped(source, callback) {
  const result = new MappedCollection();
  source.each(function (i, value) {
    const next = callback.call(value, i, value);
    if (Array.isArray(next)) { for (const item of next) result.push(item); }
    else if (next != null) result.push(next);
  });
  const state = selections.get(source)?.state;
  if (state && result.every(value => nodes.has(value))) return selection(state, inputIds(state, result), source);
  Object.defineProperty(result, 'previous', { value: source });
  return result;
}
function until(source, axis, stop, selector) {
  const { state, ids } = entry(source), result = [];
  for (const id of ids) {
    for (const node of selection(state, Uint32Array.of(id))._traverse(axis)) {
      if (stop && state.api(node).is(stop)) break;
      if (!result.includes(node)) result.push(node);
    }
  }
  let resultIds = inputIds(state, result);
  if (axis === 9 && ids.length > 1) resultIds = edit(state, 13, resultIds).reverse();
  const value = selection(state, resultIds, source);
  return selector ? value.filter(selector) : value;
}
const classTokens = value => typeof value === 'string' ? value.match(/[^\x20\t\r\n\f]+/g) ?? [] : Array.isArray(value) ? value.flatMap(classTokens) : [];
function classes(source, action, value, force, argc) {
  const { state } = entry(source);
  return source.each(function (i, node) {
    if (node.nodeType !== 1) return;
    const one = state.api(node), old = one.attr('class') ?? '';
    const next = typeof value === 'function' ? action === 'toggle' ? value.call(node, i, old, force) : value.call(node, i, old) : value;
    if (action === 'remove' && !argc) { one.attr('class', ''); return; }
    if (action === 'toggle' && (next === undefined || typeof next === 'boolean')) {
      const data = nodes.get(node);
      if (old) data.savedClass = old;
      one.attr('class', next === false || old ? '' : data.savedClass ?? '');
      return;
    }
    const requested = classTokens(next);
    if (!requested.length) return;
    let tokens = classTokens(old);
    for (const token of requested) {
      const present = tokens.includes(token);
      const remove = action === 'remove' || (action === 'toggle' && (force === false || (force === undefined && present)));
      if (remove) tokens = tokens.filter(item => item !== token);
      else if (!present) tokens.push(token);
    }
    const updated = tokens.join(' ');
    if (old !== updated) one.attr('class', updated);
  });
}
function wrapping(source, wrapper, inside) {
  const { state, ids } = entry(source);
  return source.each(function (i, node) {
    if (inside ? node.nodeType !== 1 && node.type !== 'root' : node.type === 'root') return;
    const one = state.api(node);
    const value = typeof wrapper === 'function' ? wrapper.call(node, i, node) : wrapper;
    let root = state.api(value).first();
    if (!root.length || root[0].nodeType !== 1 || root[0] === node) return;
    if (i + 1 < ids.length || (typeof value === 'string' && !value.trimStart().startsWith('<'))) root = root.clone();
    let inner = root;
    while (inner.children().length) inner = inner.children().first();
    if (inside) {
      const contents = one.contents();
      inner.empty().append(contents);
      one.empty().append(root);
    } else {
      one.before(root);
      inner.empty().append(one);
    }
  });
}
function content(source, position, values) {
  const { state, ids } = entry(source);
  if (!ids.length) return source;
  if (values.length === 1 && typeof values[0] === 'function') return source.each(function (i, node) {
    if (node.nodeType !== 1) return;
    const one = state.api(node);
    content(one, position, [values[0].call(node, i, one.html())]);
  });
  const ordered = position === 1 || position === 3 ? [...values].reverse() : values;
  for (const value of ordered) {
    if (value == null) continue;
    if (typeof value === 'string') {
      if (position === 0) enqueue(state, ids, 5, value);
      else edit(state, position + 7, ids, empty, value);
    } else if (Array.isArray(value) && value.some(item => typeof item === 'string' || Array.isArray(item))) content(source, position, value);
    else edit(state, position + 3, ids, inputIds(state, value));
  }
  return source;
}
function dataValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (String(Number(value)) === value) return Number(value);
  if (/^[\[{]/.test(value)) { try { return JSON.parse(value); } catch {} }
  return value;
}
function camel(value) { return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }



function xmlFlags(options) {
  const value = typeof options.xml === 'object' && options.xml !== null ? options.xml : {};
  let flags = 1;
  for (const key of Object.keys(value)) {
    if (!['decodeEntities', 'lowerCaseTags', 'lowerCaseAttributeNames', 'selfClosingTags', 'emptyAttrs', 'encodeEntities', 'xmlMode', 'recognizeSelfClosing', 'recognizeCDATA'].includes(key)) unsupported(`Unsupported XML option: ${key}`);
    if (key !== 'encodeEntities' && typeof value[key] !== 'boolean') throw new TypeError(`Expected XML ${key} boolean`);
  }
  if (value.xmlMode === false) unsupported('The htmlparser2 HTML parser mode is not supported.');
  if (value.decodeEntities === false) flags = 16;
  if (value.lowerCaseTags) flags |= 2;
  if (value.lowerCaseAttributeNames) flags |= 4;
  if (value.selfClosingTags === false) flags |= 8;
  if (value.encodeEntities !== undefined) {
    if (![true, false, 'utf8'].includes(value.encodeEntities)) throw new TypeError('Expected encodeEntities boolean or utf8');
    flags &= ~16;
    if (value.encodeEntities === false) flags |= 16;
  }
  return flags;
}

function serializerOptions(state, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected serializer options');
  const flat = { ...options };
  if (flat.xml && typeof flat.xml === 'object') Object.assign(flat, flat.xml);
  for (const key of Object.keys(flat)) {
    if (!['xml', 'xmlMode', 'decodeEntities', 'encodeEntities', 'selfClosingTags', 'emptyAttrs'].includes(key)) unsupported(`Unsupported serializer option: ${key}`);
    if (key === 'xml') {
      if (typeof flat.xml !== 'boolean' && (!flat.xml || typeof flat.xml !== 'object' || Array.isArray(flat.xml))) throw new TypeError('Expected xml boolean or serializer options');
    } else if (key === 'encodeEntities') {
      if (![true, false, 'utf8'].includes(flat[key])) throw new TypeError('Expected encodeEntities boolean or utf8');
    } else if (typeof flat[key] !== 'boolean') throw new TypeError(`Expected ${key} boolean`);
  }
  if (!state.xml && !flat.xml && !flat.xmlMode) return null;
  delete flat.xml;
  delete flat.xmlMode;
  // Cheerio retains its nested xml options when applying top-level render
  // options. A new xml object (or boolean) replaces that nested precedence.
  return xmlFlags({ xml: { ...state.serialization, ...flat, ...(options.xml === undefined ? state.serialization : typeof options.xml === 'object' ? options.xml : {}) } }) & 24;
}

export function load(content, options = {}, isDocument = true) {
  if (Buffer.isBuffer(content)) content = content.toString('utf8');
  if (typeof content !== 'string') unsupported('load accepts HTML strings or UTF-8 Buffers.');
  options ??= {};
  if (typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected parser options');
  for (const key of Object.keys(options)) if (!['scriptingEnabled', 'execution', 'baseURI', 'xml', 'xmlMode'].includes(key)) unsupported(`Unsupported parser option: ${key}`);
  if (options.scriptingEnabled !== undefined && typeof options.scriptingEnabled !== 'boolean') throw new TypeError('Expected scriptingEnabled boolean');
  if (typeof isDocument !== 'boolean') throw new TypeError('Expected isDocument boolean');
  if (options.execution !== undefined && !['buffered', 'direct'].includes(options.execution)) throw new TypeError('Expected buffered or direct execution');
  if (options.xmlMode !== undefined && typeof options.xmlMode !== 'boolean') throw new TypeError('Expected xmlMode boolean');
  if (options.xml !== undefined && typeof options.xml !== 'boolean' && (!options.xml || typeof options.xml !== 'object' || Array.isArray(options.xml))) throw new TypeError('Expected xml boolean or options');
  const xml = Boolean(options.xml || options.xmlMode);
  const state = {
    owner: xml ? kernel.createXML(content, xmlFlags(options)) : kernel.create(content, options.scriptingEnabled ?? true, !isDocument),
    xml,
    serialization: typeof options.xml === 'object' ? { ...options.xml } : undefined,
    closed: false, direct: options.execution === 'direct', wrappers: new Map(), data: new Map(), baseURI: options.baseURI,
    words: new Uint32Array(256), payload: new Uint8Array(1024), wordLength: 0, byteLength: 0,
    usedWords: null, usedPayload: null, callbackIds: null,
  };
  const rootIds = Uint32Array.of(1);
  function $(input, context) {
    alive(state);
    if (!input) return selection(state, empty);
    if (typeof input !== 'string') {
      if (context !== undefined) unsupported('Node inputs with a context are not supported.');
      return selection(state, inputIds(state, input));
    }
    if (input.trimStart().startsWith('<') && input.trimEnd().endsWith('>')) {
      const result = selection(state, edit(state, 1, empty, empty, input));
      if (context && typeof context === 'object' && !nodes.has(context) && !selections.has(context) && !Array.isArray(context)) for (const [key, value] of Object.entries(context)) typeof result[key] === 'function' ? result[key](value) : result.attr(key, value);
      return result;
    }
    if (context !== undefined && typeof context !== 'string') {
      const contextState = selections.get(context)?.state ?? nodes.get(context)?.state;
      if (contextState && contextState !== state) return contextState.api(context).find(input);
    }
    let roots;
    if (typeof context === 'string' && context.trimStart().startsWith('<')) {
      const fragment = $(context);
      roots = fragment.length ? inputIds(state, fragment[0].parent) : empty;
    } else roots = context === undefined ? rootIds : typeof context === 'string' ? entry($(context)).ids : inputIds(state, context);
    return selection(state, query(state, input, roots));
  }
  state.api = $;
  $.prototype = Selection.prototype;
  $.root = () => { alive(state); return selection(state, rootIds); };
  $.html = (input, options) => {
    if (input && typeof input === 'object' && !nodes.has(input) && !selections.has(input) && !Array.isArray(input)) { options = input; input = undefined; }
    if (options !== undefined) {
      const flags = serializerOptions(state, options);
      if (selections.has(input)) return input.toString();
      if (flags !== null) return read(state, input == null ? rootIds : entry($(input)).ids, 12 | (flags << 8));
    }
    return input === undefined ? read(state, rootIds, 3) : read(state, entry($(input)).ids, 10);
  };
  $.xml = input => {
    alive(state);
    return selections.has(input) ? input.toString() : read(state, input === undefined ? rootIds : entry($(input)).ids, 11);
  };
  $.text = input => read(state, input === undefined ? rootIds : entry($(input)).ids, 2);
  $.contains = (container, contained) => {
    alive(state);
    return contains(container, contained);
  };
  $.parseHTML = (html, context, keepScripts) => {
    if (typeof html !== 'string' || !html) return null;
    const parsed = selection(state, edit(state, 1, empty, empty, html));
    if (keepScripts ?? (typeof context === 'boolean' ? context : false)) return parsed.get();
    parsed.find('script').remove();
    return parsed.not('script').get();
  };
  $.extract = map => $.root().extract(map);
  $.merge = merge;
  $.load = load;
  $.flush = () => flush(state);
  $.dispose = () => {
    if (state.closed) return;
    state.wordLength = state.byteLength = 0;
    kernel.dispose(state.owner);
    state.owner = null;
    state.closed = true;
    state.words = state.payload = null;
    state.usedWords = state.usedPayload = null;
    state.callbackIds = null;
    state.wrappers.clear();
    state.data.clear();
    state.selectorAliases?.clear();
  };
  return $;
}

export function contains(container, contained) {
  const a = nodes.get(container), b = nodes.get(contained);
  if (!a || !b) throw new TypeError('Expected GroveDOM node handles');
  alive(a.state); alive(b.state);
  if (a.state !== b.state) return false;
  for (let node = contained.parent; node; node = node.parent) if (node === container) return true;
  return false;
}

export function merge(first, second) {
  const arrayLike = value => {
    if (Array.isArray(value) || selections.has(value)) return true;
    if (value === null || typeof value !== 'object' || !Number.isSafeInteger(value.length) || value.length < 0) return false;
    for (let i = 0; i < value.length; i++) if (!(i in value)) return false;
    return true;
  };
  if (!arrayLike(first) || !arrayLike(second)) return undefined;
  if (selections.has(first)) {
    const record = entry(first), added = inputIds(record.state, selections.has(second) ? second : Array.from(second));
    const ids = new Uint32Array(record.ids.length + added.length);
    ids.set(record.ids); ids.set(added, record.ids.length); record.ids = ids;
  } else {
    let length = first.length;
    const count = second.length;
    for (let i = 0; i < count; i++) first[length++] = second[i];
    first.length = length;
  }
  return first;
}
