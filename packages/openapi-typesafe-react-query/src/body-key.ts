/**
 * The body part of a query key (ADR-046). TanStack Query hashes a key as JSON, which writes a
 * FormData, a Blob, an ArrayBuffer or a URLSearchParams as `{}`, as the whole body or as a field
 * of an object body (a multipart body written as `{ image: file }`). The key holds each such value
 * by its content and names its kind beside the body, so the key names what is sent. Values are
 * read by the rule of `key-read.ts`, which parameters and headers share.
 */
import { type Ancestors, attempt, isClass, keyOf, walkMembers } from "./key-read.js";

/**
 * The classes of `Number`, `Boolean` and `String` objects (`new Number(1)`). JSON writes such an
 * object as its primitive value, which its members do not hold.
 */
const BOXED_PRIMITIVE_CLASSES: readonly string[] = ["Number", "Boolean", "String"];

/**
 * The kind of a value that JSON cannot hold: a raw value, or a number JSON writes as `null` while
 * a form or multipart body sends its text, named by that text, or a bigint, which JSON cannot
 * send at all while a form or multipart body sends its text.
 */
type RawKind =
  | "URLSearchParams"
  | "FormData"
  | "Blob"
  | "bytes"
  | "NaN"
  | "Infinity"
  | "-Infinity"
  | "bigint";

/**
 * The kinds of the values JSON cannot hold in a body: the kind of a body that is one, or, for an
 * object or an array body, the kinds of its members by their names or indexes, only where there
 * are some.
 */
type BodyKinds = RawKind | { readonly [member: string]: BodyKinds };

/** A body as a value TanStack Query hashes, and the kinds of the values JSON cannot hold in it. */
export interface BodyKey {
  /** The body as plain values; absent when its JSON form throws. */
  readonly body?: unknown;
  readonly bodyType?: BodyKinds;
  /** The members a form or multipart body sends, for a body with its own JSON form. */
  readonly bodyFields?: BodyKey;
}

/**
 * Whether JSON writes a value by its own JSON form rather than by its members: an object with a
 * `toJSON` (a Date), or a `Number`, `Boolean` or `String` object of any realm. A `toJSON` getter
 * that throws gives no form: JSON fails for the value, while a form or multipart body sends its
 * members.
 */
function hasJsonForm(value: object): boolean {
  return (
    attempt(() => typeof (value as { toJSON?: unknown }).toJSON === "function") === true ||
    BOXED_PRIMITIVE_CLASSES.some((name) => isClass(value, name))
  );
}

/**
 * A value of its own JSON form by that form, as `JSON.stringify` writes it: what its `toJSON`
 * returns, or the primitive of a boxed primitive (JSON reads it with `valueOf`). The object itself
 * is not kept: TanStack Query's filters match an object by its own members, and a Date or a
 * `Number` object has none, so `setQueriesData` with one value wrote into the queries of every
 * other value. An object form is walked by its members, as JSON writes it without calling a
 * `toJSON` again, which also ends a `toJSON` that returns its own object. Throws when the
 * `toJSON` does, for `keyOf` to leave the value out.
 */
function jsonFormKey(value: object, ancestors: Ancestors): BodyKey | undefined {
  const { toJSON } = value as { toJSON?: unknown };
  const form: unknown = typeof toJSON === "function" ? toJSON.call(value) : value.valueOf();
  const inner = [...ancestors, value];
  return typeof form === "object" && form !== null
    ? membersKey(form, inner)
    : keyOf(form, inner, memberKey);
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
 * The members of an object or an array body as `readMembers` reads them, each as `memberKey`,
 * and their kinds by name or index. A member `keyOf` leaves out is `undefined`, which the hash
 * leaves out, as JSON does. An empty object or array stays: a JSON `{}` or `[]` is a body,
 * unlike none. An item left out, also `undefined` and a hole, is `null`, which JSON and the form
 * bodies send for it alike: kept as `undefined`, it turned `null` in a JSON round trip
 * (`hydrate`), and filters missed the query.
 */
function membersKey(members: object, ancestors: Ancestors): BodyKey {
  const isList = Array.isArray(members);
  const body: Record<string, unknown> | unknown[] = isList ? [] : {};
  const kinds: Record<string, BodyKinds> = {};
  for (const [name, member] of walkMembers(members, ancestors, memberKey)) {
    (body as Record<string, unknown>)[name] = isList ? (member?.body ?? null) : member?.body;
    if (member?.bodyType !== undefined) {
      kinds[name] = member.bodyType;
    }
  }
  return Object.keys(kinds).length === 0 ? { body } : { body, bodyType: kinds };
}

/**
 * A value inside a body. A value of its own JSON form is its `jsonFormKey`. `NaN` and the
 * infinities are `null`, as JSON sends them, with their text as their kind: a form or multipart
 * body sends `NaN`, and a `NaN` kept in the key would not even match itself in a filter. A bigint
 * is its text, as a form or multipart body sends it, of the kind `"bigint"`, apart from a string:
 * JSON fails for it, and TanStack Query's hash throws for it while the component renders. Bytes
 * are walked by their members like any other object, which writes them as JSON sends them, a
 * `Uint16Array` as `{ "0": 256 }` and an ArrayBuffer as `{}`; their bytes would name `[0, 1]` for
 * it, as for a `Uint8Array` of 0 and 1. A form or multipart body rejects such a member, so JSON is
 * the only body that sends one. Only reached through `keyOf`, which leaves a function out.
 */
function memberKey(value: unknown, ancestors: Ancestors): BodyKey | undefined {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { body: null, bodyType: String(value) as RawKind };
  }
  if (typeof value === "bigint") {
    return { body: String(value), bodyType: "bigint" };
  }
  if (typeof value !== "object" || value === null) {
    return { body: value };
  }
  return hasJsonForm(value)
    ? jsonFormKey(value, ancestors)
    : (rawValueKey(value) ?? membersKey(value, ancestors));
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
 * are some. A Date has none, so its key is its JSON form alone. A `toJSON` that throws leaves
 * the members alone, which a form or multipart body still sends.
 *
 * The caller reads the body with `keyOf`, which leaves out a function body (JSON sends it as no
 * body) and a body that throws while it is read; the request reports the error.
 */
export function bodyKey(body: unknown): BodyKey | undefined {
  if (typeof body !== "object" || body === null) {
    return memberKey(body, []);
  }
  return (
    bytesKey(body) ??
    (hasJsonForm(body) && Object.keys(body).length > 0
      ? { ...attempt(() => jsonFormKey(body, [])), bodyFields: membersKey(body, []) }
      : memberKey(body, []))
  );
}
