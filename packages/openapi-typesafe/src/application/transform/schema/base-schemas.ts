import { appendPointer, type PointerSegment } from "../../../domain/openapi/json-pointer.js";
import { pointerNode, refPointerOf } from "../ref-pointer/pointer-walk.js";
import type { SchemaContext } from "./schema-context.js";

/**
 * Where an inline schema is typed: the location path and the slot there
 * (`SchemaRequest.sharedSlot`), which name its `--enum` enum. `isLater` says whether it is a part
 * of the `allOf` after the one typed with it (`inlineParts`): of two enums of one place, only the
 * earlier part's takes the other's members, so the two never take each other's.
 */
export interface InlineLocation {
  readonly path: string | undefined;
  readonly slot: string;
  readonly isLater: boolean;
}

/**
 * A schema that TypeScript intersects with another one at that schema's place
 * (`Pet & { mode?: CatMode }`). Either it is typed at a location of its own, which the place
 * cannot change: `pointer` is that schema in the document, with every `$ref` on the way followed
 * (a `$ref` item's schema, or a part of it). Or it is typed inline at the same location and slot
 * as the schema (`inline`, `pointer` null): the own keywords next to an `allOf`, or another inline
 * item of it. `omitted` are the property keys the type leaves out of the schema (`Omit<Pet,
 * "kind">` for a discriminator), at its own level only.
 */
export interface BaseSchema {
  readonly pointer: string | null;
  readonly node: unknown;
  readonly inline: InlineLocation | null;
  readonly omitted: readonly string[];
}

/** No base: a schema the walk types at a place of its own. */
export const NO_BASE_SCHEMAS: readonly BaseSchema[] = [];

/** Each `$ref` is followed at most this often, so a cycle of `$ref`s ends. */
const MAX_REF_HOPS = 32;

/** What reading the bases needs: the document, and the discriminators that omit properties. */
export type BaseContext = Pick<SchemaContext, "refs" | "discriminators">;

type RefResolver = BaseContext["refs"];

function isObjectNode(node: unknown): node is Readonly<Record<string, unknown>> {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

function refOf(node: unknown): string | undefined {
  const ref = isObjectNode(node) ? node.$ref : undefined;
  return typeof ref === "string" ? ref : undefined;
}

/** The schema at `pointer` once its `$ref`s are followed, and where it is; null as below. */
function resolvedNode(
  pointer: string,
  refs: RefResolver,
): { readonly pointer: string; readonly node: unknown } | null {
  let current = pointer;
  for (let hop = 0; hop < MAX_REF_HOPS; hop += 1) {
    // The node as the document writes it: `resolve` follows a `$ref` at the end too.
    const pointerParts = refPointerOf(current);
    const node = pointerParts === null ? undefined : pointerNode(pointerParts, refs);
    if (node === undefined || node === null) {
      return null;
    }
    const ref = refOf(node);
    if (ref === undefined) {
      return { pointer: current, node };
    }
    current = ref;
  }
  return null;
}

/**
 * The pointer of the schema at `pointer` once its `$ref`s are followed; null where the document
 * has no schema there, or the `$ref`s go round in a cycle.
 */
export function resolvedPointer(pointer: string, refs: RefResolver): string | null {
  return resolvedNode(pointer, refs)?.pointer ?? null;
}

/** A base with its `$ref` followed: an inline `$ref` is a schema typed at its own location. */
function followed(base: BaseSchema, refs: RefResolver): BaseSchema | null {
  const ref = base.pointer ?? refOf(base.node);
  if (ref === undefined) {
    return base;
  }
  const resolved = resolvedNode(ref, refs);
  return resolved === null ? null : { ...resolved, inline: null, omitted: base.omitted };
}

/** The `allOf` item at `index` of a base, which the base's type intersects. */
function allOfItem(base: BaseSchema, item: unknown, index: number, context: BaseContext) {
  const ref = refOf(item);
  if (ref !== undefined) {
    // A discriminator owner's property is left out where an `allOf` names it (`allOfItemShape`).
    const property = context.discriminators.objectAt(ref)?.propertyName;
    const omitted = property === undefined ? base.omitted : [...base.omitted, property];
    return { base: { pointer: ref, node: item, inline: null, omitted }, isRef: true };
  }
  const pointer = base.pointer === null ? null : appendPointer(base.pointer, ["allOf", index]);
  return { base: { pointer, node: item, inline: base.inline, omitted: base.omitted } };
}

/**
 * The parts of a base that TypeScript intersects at its place: the base and its `allOf` items,
 * through `allOf` chains and `$ref`s, each `$ref` once. The parts of `$ref` items come first: the
 * base types its own keywords by the enum of the base it narrows, so the farthest base that
 * declares a value list is the one whose enum the place has.
 */
function partsOf(base: BaseSchema, context: BaseContext, visited: ReadonlySet<string>) {
  const own = followed(base, context.refs);
  if (own === null || (own.pointer !== null && visited.has(own.pointer))) {
    return [];
  }
  const seen = own.pointer === null ? visited : new Set([...visited, own.pointer]);
  const items = isObjectNode(own.node) && Array.isArray(own.node.allOf) ? own.node.allOf : [];
  const first: BaseSchema[] = [];
  const last: BaseSchema[] = [];
  items.forEach((item: unknown, index: number) => {
    const part = allOfItem(own, item, index, context);
    (part.isRef === true ? first : last).push(...partsOf(part.base, context, seen));
  });
  return [...first, own, ...last];
}

/** The bases with each schema at most once (a base reached on two `allOf` paths). */
function distinct(bases: readonly BaseSchema[]): readonly BaseSchema[] {
  const pointers = new Set<string>();
  return bases.filter((base) => {
    if (base.pointer === null) {
      return true;
    }
    const isNew = !pointers.has(base.pointer);
    pointers.add(base.pointer);
    return isNew;
  });
}

/** The parts of each base (`partsOf`), each schema once: what the place intersects. */
export function expandedBases(
  bases: readonly BaseSchema[],
  context: BaseContext,
): readonly BaseSchema[] {
  return distinct(bases.flatMap((base) => partsOf(base, context, new Set())));
}

/**
 * The slot of a schema typed at its holder's location next to other schemas
 * (`SchemaRequest.sharedSlot`): the holder's slot and path and the step into it.
 */
export function slotAfter(slot: string, path: string | undefined, step: readonly unknown[]) {
  return JSON.stringify([slot, path ?? null, step]);
}

/** Where an inline base's schema below it is typed: a property's own path, or a shared slot. */
function inlineAt(inline: InlineLocation, segments: readonly PointerSegment[]): InlineLocation {
  const [keyword, key] = segments;
  return keyword === "properties"
    ? { ...inline, path: appendPointer(inline.path, [String(key)]) }
    : { ...inline, slot: slotAfter(inline.slot, inline.path, segments) };
}

/** The schema of a base below it at `segments`; null where the base has none there. */
function steppedBase(base: BaseSchema, segments: readonly PointerSegment[]): BaseSchema | null {
  if (base.pointer !== null) {
    const pointer = appendPointer(base.pointer, segments);
    return { pointer, node: undefined, inline: null, omitted: [] };
  }
  let node = base.node;
  // Missing segments are skipped, as `appendPointer` skips them for a base in the document.
  for (const segment of segments.filter((part) => part !== undefined && part !== null)) {
    const isHolder = isObjectNode(node) || Array.isArray(node);
    node = isHolder ? (node as Readonly<Record<string, unknown>>)[String(segment)] : undefined;
  }
  const inline = base.inline === null ? null : inlineAt(base.inline, segments);
  return node === undefined ? null : { pointer: null, node, inline, omitted: [] };
}

/**
 * The bases of the schema at `segments` below the current one (`["properties", "mode"]`,
 * `["items"]`): each base's schema at the same place, where the base has one, and its parts.
 */
export function baseSchemasAt(
  bases: readonly BaseSchema[],
  segments: readonly PointerSegment[],
  context: BaseContext,
): readonly BaseSchema[] {
  if (bases.length === 0) {
    return NO_BASE_SCHEMAS;
  }
  const [keyword, key] = segments;
  const stepped: BaseSchema[] = [];
  for (const base of bases) {
    const isOmitted = keyword === "properties" && base.omitted.includes(String(key));
    const next = isOmitted ? null : steppedBase(base, segments);
    if (next !== null) {
      stepped.push(next);
    }
  }
  return stepped.length === 0 ? NO_BASE_SCHEMAS : expandedBases(stepped, context);
}
