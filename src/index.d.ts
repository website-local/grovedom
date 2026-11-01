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
export type NodeInput = NodeHandle | Selection | FastSelection | NodeHandle[];
export type Filter = string | NodeInput | FilterFunction<NodeHandle>;
export type AttributeValue = string | number | boolean | null;
export type Callback<T, R = T> = (this: NodeHandle, index: number, old: T) => R;
export type Content = string | NodeInput | null;
export type ClassValue = string | string[];
export interface ExtractDescriptor { selector: string; value?: string | ExtractMap | ((node: NodeHandle, key: string, values: Record<string, unknown>) => unknown); }
export type ExtractValue = string | ExtractDescriptor | [string | ExtractDescriptor];
export interface ExtractMap { [key: string]: ExtractValue; }
type ExtractedListItem<T> = T extends readonly unknown[] ? T[number] : NonNullable<T>;
type Extracted<V> = V extends [infer E] ? ExtractedListItem<Extracted<E>>[] : V extends string ? string | undefined : V extends { value: infer R } ? R extends (...args: never[]) => infer T ? T | undefined : R extends ExtractMap ? ExtractedMap<R> | undefined : unknown : string | undefined;
export type ExtractedMap<M extends ExtractMap> = { [K in keyof M]: Extracted<M[K]> };

export interface MappedCollection<T, S = Selection> extends Iterable<T> {
  readonly [index: number]: T | undefined;
  readonly length: number;
  get(): T[];
  get(index: number): T | undefined;
  toArray(): T[];
  each(callback: (this: T, index: number, value: T) => void | boolean): this;
  map<U>(callback: (this: T, index: number, value: T) => U | U[] | null | undefined): MappedCollection<U, S>;
  eq(index: number): MappedCollection<T, S>;
  first(): MappedCollection<T, S>;
  last(): MappedCollection<T, S>;
  slice(start?: number, end?: number): MappedCollection<T, S>;
  end(): S | MappedCollection<unknown, S> | undefined;
}
interface SelectionMethods<S> extends Iterable<NodeHandle> {
  readonly cheerio: string;
  readonly length: number;
  get(): NodeHandle[];
  get(index: number): NodeHandle | undefined;
  toArray(): NodeHandle[];
  eq(index: number): S;
  first(): S;
  last(): S;
  slice(start?: number, end?: number): S;
  splice(start?: number, deleteCount?: number, ...items: NodeHandle[]): NodeHandle[];
  end(): S;
  find(selector: string | NodeInput): S;
  children(selector?: Filter): S;
  parent(selector?: Filter): S;
  parents(selector?: Filter): S;
  parentsUntil(stop?: Filter, selector?: Filter): S;
  contents(): S;
  next(selector?: Filter): S;
  prev(selector?: Filter): S;
  nextAll(selector?: Filter): S;
  prevAll(selector?: Filter): S;
  nextUntil(stop?: Filter, selector?: Filter): S;
  prevUntil(stop?: Filter, selector?: Filter): S;
  siblings(selector?: Filter): S;
  closest(selector: Filter, context?: NodeHandle): S;
  each(callback: (this: NodeHandle, index: number, node: NodeHandle) => void | boolean): this;
  map(callback: (this: NodeHandle, index: number, node: NodeHandle) => NodeHandle | NodeHandle[] | null | undefined): S;
  map<T>(callback: (this: NodeHandle, index: number, node: NodeHandle) => T | T[] | null | undefined): MappedCollection<T, S>;
  filter(selector: Filter): S;
  not(selector: Filter): S;
  is(selector: Filter): boolean;
  has(selector: string | NodeInput): S;
  add(selector: string | NodeInput, context?: string | NodeInput): S;
  addBack(selector?: Filter): S;
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
  appendTo(target: string | NodeInput): S;
  prependTo(target: string | NodeInput): S;
  insertBefore(target: string | NodeInput): S;
  insertAfter(target: string | NodeInput): S;
  replaceWith(value: Content | Callback<NodeHandle, Content>): this;
  wrap(value: string | NodeInput | Callback<NodeHandle, string | NodeInput>): this;
  wrapAll(value: string | NodeInput | Callback<NodeHandle, string | NodeInput>): this;
  wrapInner(value: string | NodeInput | Callback<NodeHandle, string | NodeInput>): this;
  unwrap(selector?: Filter): this;
  empty(): this;
  remove(selector?: Filter): this;
  detach(selector?: Filter): this;
  clone(): S;
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
/** Cheerio-shaped selection with numeric indexing. */
export interface Selection extends SelectionMethods<Selection> {
  [index: number]: NodeHandle | undefined;
}
/** Selection returned by loadFast; access nodes with get() or iteration. */
export interface FastSelection extends SelectionMethods<FastSelection> {}
type QueryContext = string | NodeInput | Record<string, unknown> | undefined;
interface DocumentMethods<S, API> {
  // Foreign node/selection contexts can delegate to their owning document.
  (selector: string, context: Selection): S | Selection;
  (selector: string, context: FastSelection): S | FastSelection;
  (selector: string, context: NodeHandle): Selection | FastSelection;
  (selector?: string | NodeInput | null, context?: string | NodeHandle[] | Record<string, unknown>): S;
  (selector?: string | NodeInput | null, context?: QueryContext): S | Selection | FastSelection;
  root(): S;
  html(options?: SerializerOptions): string;
  html(input: string | NodeInput | undefined, options?: SerializerOptions): string;
  xml(input?: string | NodeInput): string;
  text(input?: string | NodeInput): string;
  contains(container: NodeHandle, contained: NodeHandle): boolean;
  parseHTML(html: string, keepScripts?: boolean): NodeHandle[] | null;
  parseHTML(html: string, context: unknown, keepScripts?: boolean): NodeHandle[] | null;
  extract<M extends ExtractMap>(map: M): ExtractedMap<M>;
  /** Parse a new document in the same selection mode. */
  load(content: string | Uint8Array, options?: LoadOptions | null, isDocument?: boolean): API;
  merge: typeof merge;
  /** Apply all queued operations in issue order. */
  flush(): void;
  /** Discard pending operations and free the document; safe to call repeatedly. */
  dispose(): void;
}
export interface GroveDOMAPI extends DocumentMethods<Selection, GroveDOMAPI> {}
export interface FastGroveDOMAPI extends DocumentMethods<FastSelection, FastGroveDOMAPI> {}
export function load(content: string | Uint8Array, options?: LoadOptions | null, isDocument?: boolean): GroveDOMAPI;
/** Parse with ordinary selections, without numeric indexing; shares load's runtime and options. */
export function loadFast(content: string | Uint8Array, options?: LoadOptions | null, isDocument?: boolean): FastGroveDOMAPI;
export function contains(container: NodeHandle, contained: NodeHandle): boolean;
/** Append to the first array-like value; return undefined for invalid inputs. */
export function merge<S extends Selection | FastSelection>(first: S, second: ArrayLike<NodeHandle | undefined> | FastSelection): S | undefined;
export function merge<A extends { length: number; [index: number]: NodeHandle | undefined }>(first: A, second: FastSelection): A | undefined;
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
/** Configure once before DOM calls. Initialization is synchronous on Node. */
export function init(options?: InitOptions): void;
