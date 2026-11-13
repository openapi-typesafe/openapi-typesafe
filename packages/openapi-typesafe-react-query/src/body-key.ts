/**
 * The body part of a query key (ADR-046). TanStack Query hashes a key as JSON, which writes a
 * FormData, a Blob, an ArrayBuffer or a URLSearchParams as `{}`, as the whole body or as a field
 * of an object body (a multipart body written as `{ image: file }`). The key holds each such value
 * by its content and names its kind beside the body, so the key names what is sent.
 */

/** `[object Name]`: the type tag is between these indexes of `Object.prototype.toString`. */
const TYPE_TAG_START = "[object ".length;
const TYPE_TAG_END = -1;

/**
 * The classes of `Number`, `Boolean` and `String` objects (`new Number(1)`). JSON writes such an
 * object as its primitive value, which its members do not hold.
 */
const BOXED_PRIMITIVE_CLASSES: readonly string[] = ["Number", "Boolean", "String"];

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
  /** The members a form or multipart body sends, for a body with its own JSON form. */
  readonly bodyFields?: BodyKey;
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
 * Whether JSON writes a value by its own JSON form rather than by its members: an object with a
 * `toJSON` (a Date), or a `Number`, `Boolean` or `String` object of any realm.
 */
function hasJsonForm(value: object): boolean {
  return (
    typeof (value as { toJSON?: unknown }).toJSON === "function" ||
    BOXED_PRIMITIVE_CLASSES.some((name) => isClass(value, name))
  );
}

/**
 * A whole body of bytes, an ArrayBuffer, a typed array or a DataView, which `fetch` sends as they
 * are: its bytes as numbers, also for a typed array other than a Uint8Array. Undefined for any
 * other value. An ArrayBuffer has no `buffer` and no `byteOffset`, which then reads as 0.
 */
function bytesKey(value: object): BodyKey | undefined {
  if (!ArrayBuffer.isView(value) && !isClass(value, "ArrayBuffer")) {
    return undefined;
  }
  const { buffer = value, byteOffset, byteLength } = value as Partial<ArrayBufferView>;
  const bytes = new Uint8Array(buffer as ArrayBuffer, byteOffset, byteLength);
  return { body: Array.from(bytes), bodyType: "bytes" };
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

/**
 * React Native's FormData: `append`, `getAll` and `getParts`, and no `entries`. `getParts` gives
 * each field as a plain object: its `fieldName`, its `headers`, and its text as `string` or the
 * members of the appended file object (`uri`, `name`, `type`). Its network layer sends these.
 */
interface NativeFormData {
  readonly getParts?: () => readonly object[];
}

/**
 * The fields of a FormData in a key, in order, with a file as `blobKey`. React Native's FormData
 * has no `entries`; its fields are the parts of `getParts`, as they are what it sends. A FormData
 * with neither has no fields to read.
 */
function formDataKey(form: FormData): readonly unknown[] {
  if (typeof form.entries === "function") {
    return Array.from(form.entries(), ([name, value]) => [
      name,
      typeof value === "string" ? value : blobKey(value),
    ]);
  }
  return (form as NativeFormData).getParts?.() ?? [];
}

/**
 * A value that JSON cannot hold, by its content: a URLSearchParams as its text, a FormData as its
 * fields and a Blob as `blobKey`. Undefined for any other value.
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
  return undefined;
}

/**
 * The own enumerable members of an object or an array body, each as `memberKey`, and their kinds
 * by name or index.
 * An empty object or array stays: a JSON `{}` or `[]` is a body, unlike none.
 */
function membersKey(members: object): BodyKey {
  const body: Record<string, unknown> | unknown[] = Array.isArray(members) ? [] : {};
  const kinds: Record<string, BodyKinds> = {};
  for (const [name, value] of Object.entries(members)) {
    const member = memberKey(value);
    (body as Record<string, unknown>)[name] = member.body;
    if (member.bodyType !== undefined) {
      kinds[name] = member.bodyType;
    }
  }
  return Object.keys(kinds).length === 0 ? { body } : { body, bodyType: kinds };
}

/**
 * A value inside a body. A value of its own JSON form stays as it is: TanStack Query's hash writes
 * it as JSON does. Bytes are walked by their members like any other object, which writes them as
 * JSON sends them, a `Uint16Array` as `{ "0": 256 }` and an ArrayBuffer as `{}`; their bytes
 * would name `[0, 1]` for it, as for a `Uint8Array` of 0 and 1. A form or multipart body rejects
 * such a member, so JSON is the only body that sends one.
 */
function memberKey(value: unknown): BodyKey {
  if (typeof value !== "object" || value === null || hasJsonForm(value)) {
    return { body: value };
  }
  return rawValueKey(value) ?? membersKey(value);
}

/**
 * A body in a key: a value JSON cannot hold by its content, wherever it is in the body, and the
 * kinds of such values in `bodyType`, a field no init has. A JSON body has no `bodyType`, so it
 * never shares a key with a body that holds such a value written as the same JSON. Any other
 * object, also a class instance or an object of another realm, is walked by its own enumerable
 * members, which are what `JSON.stringify` and the fetch client's form and multipart bodies send.
 * Bytes are read as bytes only as the whole body.
 *
 * A whole body of its own JSON form is sent as that form as JSON, and by its own members as a
 * form or multipart body. The key cannot see a `Content-Type` or a `bodySerializer` set on the
 * fetch client, so it holds both: the form as `body` and the members as `bodyFields`, when there
 * are some. A Date has none, so its key is its JSON form alone.
 */
export function bodyKey(body: unknown): BodyKey {
  if (typeof body !== "object" || body === null) {
    return { body };
  }
  return (
    bytesKey(body) ??
    (hasJsonForm(body) && Object.keys(body).length > 0
      ? { body, bodyFields: membersKey(body) }
      : memberKey(body))
  );
}
