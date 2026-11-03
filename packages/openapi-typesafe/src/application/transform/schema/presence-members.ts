import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { OutputFix } from "../../../domain/output-fixes.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * The `allof-required` fix (ADR-021, roadmap R6). An `allOf` member such as `{ required: [name] }`
 * or `{ type: object }` says nothing about the shape of the object; it only asks that keys are
 * present. Typed as an object of its own, it adds `& Record<string, never>` or `& unknown`. With
 * the fix, such members are left out and their keys are made required in the other members, the
 * same way the parent's `required` is (upstream #1474, #1520, #2165).
 */

/**
 * Keywords that do not change the shape: `type: object`, `required`, and annotations that the
 * generator does not read on an `allOf` member. `default`, `readOnly` and `writeOnly` are left out:
 * they change types elsewhere.
 */
const PRESENCE_KEYWORDS: ReadonlySet<string> = new Set([
  "$comment",
  "deprecated",
  "description",
  "example",
  "examples",
  "required",
  "title",
  "type",
]);

const EXTENSION_PREFIX = "x-";
const OBJECT_TYPE = "object";

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPresenceKeyword([key, value]: readonly [string, unknown]): boolean {
  if (key === "type") {
    return value === OBJECT_TYPE;
  }
  if (key === "required") {
    return isStringList(value);
  }
  return PRESENCE_KEYWORDS.has(key) || key.startsWith(EXTENSION_PREFIX);
}

function isPresenceObject(schema: unknown): schema is SchemaObject {
  return (
    typeof schema === "object" &&
    schema !== null &&
    !Array.isArray(schema) &&
    !("$ref" in schema) &&
    Object.entries(schema).every(isPresenceKeyword)
  );
}

/**
 * The schema a member stands for: itself, or the target of a `$ref` with no sibling keywords. The
 * discriminator scan has already added the discriminator property to a mapped target, so such a
 * target is never presence-only.
 */
function memberSchema(member: Schema, request: SchemaRequest): unknown {
  if (typeof member !== "object" || member === null || !("$ref" in member)) {
    return member;
  }
  const ref = (member as { readonly $ref: unknown }).$ref;
  if (typeof ref !== "string" || Object.keys(member).length !== 1) {
    return undefined;
  }
  return request.context.refs.resolve(ref);
}

/** The `allOf` members to type, and the keys the left-out members make required. */
export interface AllOfMembers {
  readonly members: readonly Schema[];
  readonly required: readonly string[];
}

/**
 * The members of `allOf` with presence-only ones left out, when the fix is on and another member
 * is left to carry the keys; otherwise the members as they are.
 */
export function allOfMembers(members: readonly Schema[], request: SchemaRequest): AllOfMembers {
  const unchanged = { members, required: [] };
  if (!request.context.options.fixes.has(OutputFix.ALLOF_REQUIRED)) {
    return unchanged;
  }
  const schemas = members.map((member) => memberSchema(member, request));
  const kept = members.filter((_, index) => !isPresenceObject(schemas[index]));
  if (kept.length === 0 || kept.length === members.length) {
    return unchanged;
  }
  const required = schemas.flatMap((schema) =>
    isPresenceObject(schema) ? (schema.required ?? []) : [],
  );
  return { members: kept, required };
}
