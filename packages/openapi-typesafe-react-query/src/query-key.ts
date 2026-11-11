/**
 * The request part of a query key (ADR-046). TanStack Query hashes a key as JSON: a `Headers`
 * object or a list of header pairs hashed as `{}` or by its order, and so did a FormData, a Blob,
 * an ArrayBuffer or a URLSearchParams body. Two requests that differed in them shared one cache
 * entry, and the `queryFn` of that entry sent the request of the first. Two clients with
 * different base URLs shared entries too. The key's init holds the headers and such a body as
 * plain values, and the base URL the request goes to or the client's key scope, so the key names
 * what was fetched.
 */

/** Headers as a plain object, which TanStack Query hashes by its names and values. */
type HeadersRecord = Readonly<Record<string, unknown>>;

/** What the key takes from the fetch client and the options of `createClient`. */
export interface KeyClient {
  /** The fetch client's base URL, `""` without one. */
  readonly baseUrl: string;
  /** The name of the API in every key, in place of the base URL. */
  readonly keyScope?: string | undefined;
}

/** `[object Name]`: the type tag is between these indexes of `Object.prototype.toString`. */
const TYPE_TAG_START = "[object ".length;
const TYPE_TAG_END = -1;

/**
 * Whether a value is of the class `name`: an instance of this realm's global class of that name
 * (React Native's classes have no type tag), or a value with its type tag (a class of another
 * realm or of the `undici` package), as the fetch client tells bodies (ADR-030).
 */
function isClass(value: object, name: string): boolean {
  const type = (globalThis as Record<string, unknown>)[name];
  return (
    (typeof type === "function" && value instanceof type) ||
    Object.prototype.toString.call(value).slice(TYPE_TAG_START, TYPE_TAG_END) === name
  );
}

/**
 * The headers of an init as a plain object. A `Headers` object and a list of pairs, which are both
 * iterable, become the names and values the request sends: names in lowercase, a repeated one
 * joined with `, `, as `Headers` writes them. They are read without `Headers`, which threw for an
 * invalid name or value while the component rendered; the request reports it as a query error. A
 * plain object stays as it is, since its `null` and array values mean more than a string.
 */
function plainHeaders(headers: object): HeadersRecord {
  if (!(Symbol.iterator in headers)) {
    return headers as HeadersRecord;
  }
  const record: Record<string, string> = {};
  for (const pair of headers as Iterable<unknown>) {
    const [name, value] = Array.from(pair as ArrayLike<unknown>);
    const key = String(name).toLowerCase();
    record[key] = key in record ? `${record[key]}, ${String(value)}` : String(value);
  }
  return record;
}

/**
 * A Blob or a File in a key: its type, size, and the name of a File. Its bytes cannot be read while
 * the component renders, so two Blobs of the same type and size share an entry. The date of a File
 * is left out: `FormData.append` and `new File` set it to the current time, so a body built while
 * rendering got a new key, and a new request, on every render.
 */
function blobKey(blob: Blob): object {
  const { name } = blob as Partial<File>;
  return { type: blob.type, size: blob.size, name };
}

/** The fields of a FormData in a key, in order, with a file as `blobKey`. */
function formDataKey(form: FormData): unknown[] {
  // React Native's FormData has no `entries`, so its fields cannot be read.
  if (typeof form.entries !== "function") {
    return [];
  }
  return Array.from(form.entries(), ([name, value]) => [
    name,
    typeof value === "string" ? value : blobKey(value),
  ]);
}

/** The bytes of an ArrayBuffer or a typed array, or null for another value. */
function bodyBytes(body: object): Uint8Array | null {
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  return isClass(body, "ArrayBuffer") ? new Uint8Array(body as ArrayBuffer) : null;
}

/** A body that JSON cannot hold, as a value TanStack Query hashes, and the name of its kind. */
interface RawBodyKey {
  readonly body: unknown;
  readonly bodyType: "URLSearchParams" | "FormData" | "Blob" | "bytes";
}

/**
 * A body that JSON cannot hold by its content: a URLSearchParams as its text, a FormData as its
 * fields, a Blob as `blobKey` and bytes as their numbers. Undefined for any other body.
 */
function rawBodyKey(body: unknown): RawBodyKey | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  if (isClass(body, "URLSearchParams")) {
    return { body: String(body), bodyType: "URLSearchParams" };
  }
  if (isClass(body, "FormData")) {
    return { body: formDataKey(body as FormData), bodyType: "FormData" };
  }
  if (isClass(body, "Blob") || isClass(body, "File")) {
    return { body: blobKey(body as Blob), bodyType: "Blob" };
  }
  const bytes = bodyBytes(body);
  return bytes === null ? undefined : { body: Array.from(bytes), bodyType: "bytes" };
}

/**
 * The init fields that are not `undefined`. A field set to `undefined` (`headers: token ? … :
 * undefined`) sends the same request as none, so it must not make the init count as not empty.
 */
function definedFields(fields: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/**
 * The init of a query key: the request init with its headers and body as plain values, and the
 * client's key scope, or its base URL when the init has none. The `signal` is left out: TanStack
 * Query gives each request its own. A body that JSON cannot hold also names its kind in
 * `bodyType`, a field no init has, so it never shares a key with a JSON body of the same content.
 * Undefined when nothing is left, so a call without an init and one with an empty init, or one
 * of only `undefined` fields, have the key `[method, path]`.
 */
export function queryKeyInit(init: unknown, client: KeyClient): object | undefined {
  const { signal: _signal, ...rest } = (init ?? {}) as {
    signal?: unknown;
    headers?: unknown;
    baseUrl?: unknown;
    body?: unknown;
  };
  const keyInit = definedFields(rest);
  if (typeof rest.headers === "object" && rest.headers !== null) {
    keyInit.headers = plainHeaders(rest.headers);
  }
  const rawBody = rawBodyKey(rest.body);
  if (rawBody !== undefined) {
    Object.assign(keyInit, rawBody);
  }
  if (client.keyScope !== undefined) {
    keyInit.keyScope = client.keyScope;
  } else if (!rest.baseUrl && client.baseUrl) {
    keyInit.baseUrl = client.baseUrl;
  }
  return Object.keys(keyInit).length === 0 ? undefined : keyInit;
}
