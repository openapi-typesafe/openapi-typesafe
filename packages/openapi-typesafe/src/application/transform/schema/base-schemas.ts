import { appendPointer, type PointerSegment } from "../../../domain/openapi/json-pointer.js";
import { pointerNode, refPointerOf } from "../ref-pointer/pointer-walk.js";
import type { RefResolver } from "./schema-context.js";

/**
 * A schema that a `$ref` item of an `allOf` brings to the place of another schema: TypeScript
 * intersects the two (`Pet & { mode?: CatMode }`). `pointer` is where the base's schema at that
 * place is, with every `$ref` on the way followed; `omitted` are the property keys the `allOf`
 * leaves out of the base (`Omit<Pet, "kind">` for a discriminator), at the base's own level only.
 */
export interface BaseSchema {
  readonly pointer: string;
  readonly omitted: readonly string[];
}

/** No base: a schema the walk types at a place of its own. */
export const NO_BASE_SCHEMAS: readonly BaseSchema[] = [];

/** Each `$ref` is followed at most this often, so a cycle of `$ref`s ends. */
const MAX_REF_HOPS = 32;

function refOf(node: unknown): string | undefined {
  const isObject = typeof node === "object" && node !== null && !Array.isArray(node);
  const ref = isObject ? (node as { readonly $ref?: unknown }).$ref : undefined;
  return typeof ref === "string" ? ref : undefined;
}

/**
 * The pointer of the schema at `pointer` once its `$ref`s are followed; null where the document
 * has no schema there, or the `$ref`s go round in a cycle.
 */
export function resolvedPointer(pointer: string, refs: RefResolver): string | null {
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
      return current;
    }
    current = ref;
  }
  return null;
}

/**
 * The bases of the schema at `segments` below the current one (`["properties", "mode"]`,
 * `["items"]`): each base's schema at the same place, where the base has one.
 */
export function baseSchemasAt(
  bases: readonly BaseSchema[],
  segments: readonly PointerSegment[],
  refs: RefResolver,
): readonly BaseSchema[] {
  if (bases.length === 0) {
    return NO_BASE_SCHEMAS;
  }
  const [keyword, key] = segments;
  const stepped: BaseSchema[] = [];
  for (const base of bases) {
    if (keyword === "properties" && base.omitted.includes(String(key))) {
      continue;
    }
    const pointer = resolvedPointer(appendPointer(base.pointer, segments), refs);
    if (pointer !== null) {
      stepped.push({ pointer, omitted: [] });
    }
  }
  return stepped;
}
