/**
 * The body part of a query key (ADR-046). TanStack Query hashes a key as JSON, which writes a
 * FormData, a Blob, an ArrayBuffer or a URLSearchParams as `{}`, as the whole body or as a field
 * of an object body (a multipart body written as `{ image: file }`). The key holds each such value
 * by its content and names its kind beside the body, so the key names what is sent.
 */

/** `[object Name]`: the type tag is between these indexes of `Object.prototype.toString`. */
const TYPE_TAG_START = "[object ".length;
const TYPE_TAG_END = -1;

/** The kind of a value that JSON cannot hold. */
type RawKind = "URLSearchParams" | "FormData" | "Blob" | "bytes";

/**
 * The kinds of the values JSON cannot hold in a body: the kind of a body that is one, or, for an
 * object or an array body, the kinds of its members by their names or indexes, only where there
 * are some.
 */
type BodyKinds = RawKind | { readonly [member: string]: BodyKinds };

/** A body as a value TanStack Query hashes, and the kinds of the values JSON cannot hold in it. */
export interface BodyKey {
  readonly body: unknown;
  readonly bodyType?: BodyKinds;
}

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
 * Whether a value is an object literal, whose members JSON writes. A Date or another class has
 * its own JSON form, which the key keeps.
 */
export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
function valueBytes(value: object): Uint8Array | null {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return isClass(value, "ArrayBuffer") ? new Uint8Array(value as ArrayBuffer) : null;
}

/**
 * A value that JSON cannot hold, by its content: a URLSearchParams as its text, a FormData as its
 * fields, a Blob as `blobKey` and bytes as their numbers. Undefined for any other value.
 */
function rawValueKey(value: object): BodyKey | undefined {
  if (isClass(value, "URLSearchParams")) {
    return { body: String(value), bodyType: "URLSearchParams" };
  }
  if (isClass(value, "FormData")) {
    return { body: formDataKey(value as FormData), bodyType: "FormData" };
  }
  if (isClass(value, "Blob") || isClass(value, "File")) {
    return { body: blobKey(value as Blob), bodyType: "Blob" };
  }
  const bytes = valueBytes(value);
  return bytes === null ? undefined : { body: Array.from(bytes), bodyType: "bytes" };
}

/**
 * The members of an object or an array body, each as `bodyKey`, and their kinds by name or index.
 * An empty object or array stays: a JSON `{}` or `[]` is a body, unlike none.
 */
function membersKey(members: object): BodyKey {
  const body: Record<string, unknown> | unknown[] = Array.isArray(members) ? [] : {};
  const kinds: Record<string, BodyKinds> = {};
  for (const [name, value] of Object.entries(members)) {
    const member = bodyKey(value);
    (body as Record<string, unknown>)[name] = member.body;
    if (member.bodyType !== undefined) {
      kinds[name] = member.bodyType;
    }
  }
  return Object.keys(kinds).length === 0 ? { body } : { body, bodyType: kinds };
}

/**
 * A body in a key: a value JSON cannot hold by its content, wherever it is in the body, and the
 * kinds of such values in `bodyType`, a field no init has. A JSON body has no `bodyType`, so it
 * never shares a key with a body that holds such a value written as the same JSON.
 */
export function bodyKey(body: unknown): BodyKey {
  if (Array.isArray(body) || isPlainRecord(body)) {
    return membersKey(body);
  }
  const raw = typeof body === "object" && body !== null ? rawValueKey(body) : undefined;
  return raw ?? { body };
}
