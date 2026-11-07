import type { Document, normalizeTypes } from "@redocly/openapi-core";
import { parseRefPointer } from "../../domain/openapi/json-pointer.js";

/**
 * The pieces of Redocly 1.34's `$ref` resolution (`lib/resolve.js`, `lib/ref-utils.js`, MIT) that
 * the resolution check (`ref-resolution-check.ts`, ADR-031) walks with, kept as Redocly has them.
 */

type RedoclyTypes = ReturnType<typeof normalizeTypes>;
export type WalkType = RedoclyTypes[string];
type PropTypeOrFunction = WalkType["properties"][string] | WalkType["additionalProperties"];
/** The type of a property or array item, after Redocly called a type function. */
export type PropType = Exclude<PropTypeOrFunction, (...args: never[]) => unknown>;

/** Redocly's own placeholders: a node of no known type, and a scalar that is a `$ref`. */
export const UNKNOWN_TYPE: WalkType = { name: "unknown", properties: {} };
export const RESOLVABLE_SCALAR_TYPE: WalkType = { name: "scalar", properties: {} };

/** Redocly's test for an anchor reference (`#name`), which waits for the whole document walk. */
export const ANCHOR_REF = /^#[A-Za-z][A-Za-z0-9\-_:.]*$/;

/** Redocly throws a plain Error with this message for a `$ref` chain that points back to itself. */
export const REF_CYCLE_MESSAGE = "Self-referencing circular pointer";

export interface RefStack {
  readonly prev: RefStack | null;
  readonly node: unknown;
}

export interface ResolvedRef {
  readonly resolved: boolean;
  readonly node?: unknown;
  readonly document?: Document;
  readonly nodePointer?: string;
}

export type Ref = { readonly $ref: string };

export function isNamedType(type: PropType): type is WalkType {
  return typeof (type as { name?: unknown } | null | undefined)?.name === "string";
}

export function joinPointer(base: string, key: string | number): string {
  const start = base === "" ? "#/" : base;
  return start.endsWith("/") ? `${start}${key}` : `${start}/${key}`;
}

export function escapePointer(fragment: string): string {
  return fragment.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Redocly's `parseRef`: the document part (null for a local ref) and the unescaped segments. */
export function parseRef(ref: string): { uri: string | null; pointer: string[] } {
  const [uri = ""] = ref.split("#/");
  return {
    uri: (uri.endsWith("#") ? uri.slice(0, -1) : uri) || null,
    pointer: parseRefPointer(ref),
  };
}

export function hasRef(head: RefStack | null, node: unknown): boolean {
  for (let entry = head; entry !== null; entry = entry.prev) {
    if (entry.node === node) {
      return true;
    }
  }
  return false;
}

export function isExternalValue(node: object): node is { externalValue: string } {
  return typeof (node as { externalValue?: unknown }).externalValue === "string";
}

/** Wait one macrotask, as Redocly does before it reads the anchors of a document. */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/**
 * The type Redocly gives one property value, and the value to walk (a `directResolveAs` string
 * becomes a `$ref`). A value whose type has no name is not walked.
 */
export function propertyType(
  type: WalkType,
  name: string,
  value: unknown,
  specExtension: WalkType,
): [PropType, unknown] {
  // `properties[name]` also finds `Object.prototype` members, as in Redocly; for `valueOf` and the
  // like the call below throws the TypeError that the loader turns into SCHEMA_KEY_UNSUPPORTED.
  let declared: PropTypeOrFunction = type.properties[name];
  if (declared === undefined) {
    declared = type.additionalProperties;
  }
  let propType: PropType = typeof declared === "function" ? declared(value, name) : declared;
  if (propType === undefined) {
    propType = UNKNOWN_TYPE;
  }
  if (
    type.extensionsPrefix &&
    name.startsWith(type.extensionsPrefix) &&
    propType === UNKNOWN_TYPE
  ) {
    return [specExtension, value];
  }
  if (!isNamedType(propType) && propType?.directResolveAs) {
    return [propType.directResolveAs, { $ref: value }];
  }
  if (propType && !isNamedType(propType) && propType.resolvable !== false) {
    return [RESOLVABLE_SCALAR_TYPE, value];
  }
  return [propType, value];
}
