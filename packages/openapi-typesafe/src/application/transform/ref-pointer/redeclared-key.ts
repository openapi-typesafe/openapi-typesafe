import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import type { GeneratedMember } from "./generated-member.js";
import { generatedMember } from "./generated-shape.js";
import { followRefs, isJsonObject, type JsonObject, type LocatedNode } from "./located-node.js";
import { locatedMembers } from "./variants-form.js";

/**
 * A property that the composition parts of its owner declare too. The generated type of the owner
 * joins the parts (`Own & A`, `Own & (A | B)`, `Own | A`), so `Owner["key"]` reads the join of
 * every declaration, not the property's own type: `"a" | "c"` next to a `oneOf` variant's `"a"`
 * reads `"a"`. The pointer then means fewer (or more) values than its target, so the walk stops
 * and the target is typed in place (ADR-026).
 */

const COMPOSITION_KEYWORDS = ["allOf", "anyOf", "oneOf"] as const;

/** Keywords that only describe or format a value: they add nothing to its generated type. */
const NOTE_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "title",
  "description",
  "format",
  "example",
  "examples",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);

const PRIMITIVE_TYPES: ReadonlySet<unknown> = new Set(["string", "number", "integer", "boolean"]);

/**
 * Whether another declaration keeps the property's own type in the join: the same schema, or a
 * primitive one that only describes, of the target's own `type` or of none (`string` next to an
 * enum of strings, whose intersection is the enum).
 */
function isSameOrWider(other: unknown, target: unknown): boolean {
  if (JSON.stringify(other) === JSON.stringify(target)) {
    return true;
  }
  if (!isJsonObject(other) || !isJsonObject(target) || !PRIMITIVE_TYPES.has(target.type)) {
    return false;
  }
  const isNoteOnly = Object.keys(other).every((keyword) => NOTE_KEYWORDS.has(keyword));
  return isNoteOnly && (other.type === undefined || other.type === target.type);
}

/** Whether a part's member of the key changes the join: a declaration that is not the same. */
function isOtherDeclaration(member: GeneratedMember, target: unknown, refs: RefResolver) {
  switch (member.kind) {
    case "missing":
    case "index":
    case "never":
      // A declared property is read alone: other parts' index signatures take no part in it.
      return false;
    case "property":
      return !isSameOrWider(followRefs(member.node, refs), target);
    default:
      return true;
  }
}

/** Whether a part of the owner declares `name` other than its own `properties` do. */
export function isRedeclaredKey(
  owner: LocatedNode,
  name: string,
  options: SchemaOptions,
  refs: RefResolver,
): boolean {
  const node = owner.node;
  if (!isJsonObject(node)) {
    return false;
  }
  // A key its own properties do not declare has no target there: a part's property is another.
  const properties = isJsonObject(node.properties) ? node.properties : {};
  const target = followRefs(properties[name], refs);
  const located = owner as LocatedNode & { node: JsonObject };
  return COMPOSITION_KEYWORDS.flatMap((keyword) => locatedMembers(located, keyword)).some((part) =>
    isOtherDeclaration(generatedMember(part, name, options, refs), target, refs),
  );
}
