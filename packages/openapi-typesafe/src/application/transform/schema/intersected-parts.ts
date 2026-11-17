import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { type BaseSchema, expandedBases } from "./base-schemas.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * The parts of a schema with `allOf` that TypeScript intersects at the schema's location: its own
 * keywords and its inline items. Each is a base of the others (`SchemaRequest.baseSchemas`), so a
 * literal in one is typed by an enum member another declares at the same place (`enumRule`).
 */

/** The parts each schema's request intersects it with: none, or one list per part. */
export type InlineParts = readonly (readonly BaseSchema[])[];

/** The request with more bases. */
export function withBases(request: SchemaRequest, bases: readonly BaseSchema[]): SchemaRequest {
  return bases.length === 0
    ? request
    : { ...request, baseSchemas: [...request.baseSchemas, ...bases] };
}

/** Whether an `allOf` item is typed inline at the schema's location: not a `$ref`. */
function isInlineItem(item: Schema): boolean {
  return typeof item === "object" && item !== null && !("$ref" in item);
}

/**
 * The inline parts of a schema, as bases of each other: its own keywords first (not its `allOf`,
 * whose items are parts of their own), then each inline `allOf` item with its parts; none for a
 * `$ref` item, which is a base already.
 */
export function inlineParts(
  schema: SchemaObject,
  items: readonly Schema[],
  request: SchemaRequest,
): InlineParts {
  const inline = { path: request.location.path, slot: request.sharedSlot, isLater: false };
  const part = (node: unknown): BaseSchema => ({ pointer: null, node, inline, omitted: [] });
  const itemParts = items.map((item) =>
    isInlineItem(item) ? expandedBases([part(item)], request.context) : [],
  );
  return [[part(schema)], ...itemParts];
}

/** The own keywords' place in `inlineParts`; the `allOf` item at `index` is at `index + 1`. */
export const OWN_KEYWORDS_PART = 0;

/** A base of a part, marked as a later part of the `allOf` or not (`InlineLocation.isLater`). */
function placed(base: BaseSchema, isLater: boolean): BaseSchema {
  return base.inline === null ? base : { ...base, inline: { ...base.inline, isLater } };
}

/** The request of one inline part (`inlineParts` at `index`): the others are its bases. */
export function partRequest(
  parts: InlineParts,
  index: number,
  request: SchemaRequest,
): SchemaRequest {
  const bases = parts.flatMap((part, other) =>
    other === index ? [] : part.map((base) => placed(base, other > index)),
  );
  return withBases(request, bases);
}
