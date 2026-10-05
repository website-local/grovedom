/** CSS selector text, parsed and validated at runtime. */
export type SelectorType = string;
export type FilterFunction<T> = (this: T, index: number, node: T) => boolean;

export interface XMLOptions {
  decodeEntities?: boolean;
  lowerCaseTags?: boolean;
  lowerCaseAttributeNames?: boolean;
  selfClosingTags?: boolean;
  emptyAttrs?: boolean;
  encodeEntities?: boolean | 'utf8';
  recognizeSelfClosing?: boolean;
  recognizeCDATA?: boolean;
  xmlMode?: true;
}
export interface LoadOptions {
  scriptingEnabled?: boolean;
  baseURI?: string | URL;
  xmlMode?: boolean;
  xml?: boolean | XMLOptions;
  execution?: 'buffered' | 'direct';
}
export type SerializerOptions = Pick<XMLOptions, 'decodeEntities' | 'encodeEntities' | 'selfClosingTags' | 'emptyAttrs'> & {
  xmlMode?: boolean;
  xml?: boolean | Pick<XMLOptions, 'decodeEntities' | 'encodeEntities' | 'selfClosingTags' | 'emptyAttrs'>;
};
/** Document-owned identity. Handles are not domhandler AnyNode objects. */
export interface NodeHandle {
  name: string | undefined;
  tagName: string | undefined;
  readonly type: 'tag' | 'script' | 'style' | 'text' | 'cdata' | 'comment' | 'root' | 'directive' | undefined;
  readonly nodeType: number;
  readonly parent: NodeHandle | null;
  readonly parentNode: NodeHandle | null;
  readonly next: NodeHandle | null;
  readonly prev: NodeHandle | null;
  readonly nextSibling: NodeHandle | null;
  readonly previousSibling: NodeHandle | null;
  readonly children: NodeHandle[];
  readonly childNodes: NodeHandle[];
  readonly firstChild: NodeHandle | null;
  readonly lastChild: NodeHandle | null;
  readonly attribs: Record<string, string> | undefined;
  data: string | Record<string, unknown> | undefined;
}
export type NodeInput = NodeHandle | Selection | NodeHandle[];
export type Filter = string | NodeInput | FilterFunction<NodeHandle>;
export type AttributeValue = string | number | boolean | null;
export type Callback<T, R = T> = (this: NodeHandle, index: number, old: T) => R;
export type Content = string | NodeInput | null;
export type ClassValue = string | string[];
export interface ExtractDescriptor { selector: string; value?: string | ExtractMap | ((node: NodeHandle, key: string, values: Record<string, unknown>) => unknown); }
export type ExtractValue = string | ExtractDescriptor | [string | ExtractDescriptor];
export interface ExtractMap { [key: string]: ExtractValue; }
type Extracted<V> = V extends [infer E] ? NonNullable<Extracted<E>>[] : V extends string ? string | undefined : V extends { value: infer R } ? R extends (...args: never[]) => infer T ? T | undefined : R extends ExtractMap ? ExtractedMap<R> | undefined : unknown : string | undefined;
export type ExtractedMap<M extends ExtractMap> = { [K in keyof M]: Extracted<M[K]> };

export interface MappedCollection<T> extends Iterable<T> {
  readonly [index: number]: T | undefined;
  readonly length: number;
  get(): T[];
  get(index: number): T | undefined;
  toArray(): T[];
  each(callback: (this: T, index: number, value: T) => void | boolean): this;
  map<U>(callback: (this: T, index: number, value: T) => U | U[] | null | undefined): MappedCollection<U>;
  eq(index: number): MappedCollection<T>;
  first(): MappedCollection<T>;
  last(): MappedCollection<T>;
  slice(start?: number, end?: number): MappedCollection<T>;
  end(): Selection | MappedCollection<unknown> | undefined;
}
export interface Selection extends Iterable<NodeHandle> {
  readonly cheerio: string;
  [index: number]: NodeHandle | undefined;
  readonly length: number;
  get(): NodeHandle[];
  get(index: number): NodeHandle | undefined;
  toArray(): NodeHandle[];
  eq(index: number): Selection;
  first(): Selection;
  last(): Selection;
  slice(start?: number, end?: number): Selection;
  splice(start?: number, deleteCount?: number, ...items: NodeHandle[]): NodeHandle[];
  end(): Selection;
  find(selector: string | NodeInput): Selection;
  children(selector?: Filter): Selection;
  parent(selector?: Filter): Selection;
  parents(selector?: Filter): Selection;
  parentsUntil(stop?: Filter, selector?: Filter): Selection;
  contents(): Selection;
  next(selector?: Filter): Selection;
  prev(selector?: Filter): Selection;
  nextAll(selector?: Filter): Selection;
  prevAll(selector?: Filter): Selection;
  nextUntil(stop?: Filter, selector?: Filter): Selection;
  prevUntil(stop?: Filter, selector?: Filter): Selection;
  siblings(selector?: Filter): Selection;
  closest(selector: Filter, context?: NodeHandle): Selection;
  each(callback: (this: NodeHandle, index: number, node: NodeHandle) => void | boolean): this;
  map(callback: (this: NodeHandle, index: number, node: NodeHandle) => NodeHandle | NodeHandle[] | null | undefined): Selection;
  map<T>(callback: (this: NodeHandle, index: number, node: NodeHandle) => T | T[] | null | undefined): MappedCollection<T>;
  filter(selector: Filter): Selection;
  not(selector: Filter): Selection;
  is(selector: Filter): boolean;
  has(selector: string | NodeInput): Selection;
  add(selector: string | NodeInput, context?: string | NodeInput): Selection;
  addBack(selector?: Filter): Selection;
  index(value?: string | NodeInput): number;
  attr(): Record<string, string> | undefined;
  attr(name: string): string | undefined;
  attr(name: string, value: AttributeValue | undefined | Callback<string | undefined, AttributeValue | undefined>): this;
  attr(values: Record<string, AttributeValue>): this;
  removeAttr(names: string): this;
  hasClass(name: string): boolean;
  addClass(value?: ClassValue | Callback<string, ClassValue>): this;
  removeClass(value?: ClassValue | Callback<string, ClassValue>): this;
  toggleClass(value?: ClassValue | boolean | Callback<string, ClassValue>, force?: boolean): this;
  text(): string;
  text(value: AttributeValue | Callback<string, AttributeValue>): this;
  html(): string | null;
  html(value: Content | Callback<string | null, Content>): this;
  toString(): string;
  append(...values: (Content | Content[] | Callback<string | null, Content>)[]): this;
  prepend(...values: (Content | Content[] | Callback<string | null, Content>)[]): this;
  before(...values: (Content | Content[] | Callback<string | null, Content>)[]): this;
  after(...values: (Content | Content[] | Callback<string | null, Content>)[]): this;
  appendTo(target: string | NodeInput): Selection;
  prependTo(target: string | NodeInput): Selection;
  insertBefore(target: string | NodeInput): Selection;
  insertAfter(target: string | NodeInput): Selection;
  replaceWith(value: Content | Callback<NodeHandle, Content>): this;
  wrap(value: string | NodeInput | Callback<NodeHandle, string | NodeInput>): this;
  wrapAll(value: string | NodeInput | Callback<NodeHandle, string | NodeInput>): this;
  wrapInner(value: string | NodeInput | Callback<NodeHandle, string | NodeInput>): this;
  unwrap(selector?: Filter): this;
  empty(): this;
  remove(selector?: Filter): this;
  detach(selector?: Filter): this;
  clone(): Selection;
  prop(name: 'tagName' | 'nodeName'): string | undefined;
  prop(name: 'innerHTML' | 'outerHTML' | 'textContent' | 'innerText'): string | null | undefined;
  prop<K extends keyof NodeHandle>(name: K): NodeHandle[K] | undefined;
  prop(name: string): unknown;
  prop(name: string, value: unknown): this;
  prop(values: Record<string, unknown>): this;
  css(): Record<string, string> | undefined;
  css(name: string): string | undefined;
  css(names: string[]): Record<string, string> | undefined;
  css(name: string, value: string | number | Callback<string | undefined, string | number | undefined>): this;
  css(values: Record<string, string | number>): this;
  data(): Record<string, unknown> | undefined;
  data(name: string): unknown;
  data(name: string, value: unknown): this;
  data(values: Record<string, unknown>): this;
  removeData(name?: string): this;
  val(): string | string[] | undefined;
  val(value: string | number | string[] | null | Callback<string | string[] | undefined, string | number | string[] | null>): this;
  serializeArray(): { name: string; value: string }[];
  serialize(): string;
  extract<M extends ExtractMap>(map: M): ExtractedMap<M>;
}
export interface GroveDOMAPI {
  (selector?: string | NodeInput | null, context?: string | NodeInput | Record<string, unknown>): Selection;
  root(): Selection;
  html(options?: SerializerOptions): string;
  html(input: string | NodeInput | undefined, options?: SerializerOptions): string;
  xml(input?: string | NodeInput): string;
  text(input?: string | NodeInput): string;
  contains(container: NodeHandle, contained: NodeHandle): boolean;
  parseHTML(html: string, keepScripts?: boolean): NodeHandle[] | null;
  parseHTML(html: string, context: unknown, keepScripts?: boolean): NodeHandle[] | null;
  extract<M extends ExtractMap>(map: M): ExtractedMap<M>;
  load: typeof load;
  merge: typeof merge;
  /** Apply all queued operations in issue order. */
  flush(): void;
  /** Discard pending operations and free the document; safe to call repeatedly. */
  dispose(): void;
}
export function load(content: string | Uint8Array, options?: LoadOptions | null, isDocument?: boolean): GroveDOMAPI;
export function contains(container: NodeHandle, contained: NodeHandle): boolean;
/** Append to the first array-like value; return undefined for invalid inputs. */
export function merge<T>(first: { length: number; [index: number]: T }, second: ArrayLike<T>): ArrayLike<T> | undefined;

/** Opaque compiled module; init validates WebAssembly.Module identity at runtime.
 * Structural object avoids requiring DOM globals in Node-only TypeScript projects. */
export type CompiledWasmModule = object;
export interface InitOptions {
  /** A local path, file URL, bytes, or compiled module. Defaults to the bundled Wasm. */
  wasm?: string | URL | ArrayBuffer | Uint8Array | CompiledWasmModule;
  heap?: 'pool' | 'global' | 'document';
  poolSize?: number;
  poolMaxBytes?: number;
}
/** Configure once before load, contains or merge. Initialization is synchronous on Node. */
export function init(options?: InitOptions): void;
