import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import type { Schema } from "../../../domain/openapi/schema-object.js";
import { transformSchema } from "../schema/schema-transform.js";
import type { TransformContext } from "../transform-context.js";
import { unionOf } from "../type-combinators.js";
import type { ResolvedEntry } from "./parameter-entries.js";

/**
 * `exploded-query-objects` and index signatures. The keys of an exploded object are keys of
 * `query`, next to the other parameters. TypeScript checks an index signature against every key
 * of a value, so `{ page?: number } & { [key: string]: string }` admits no `page`, and no value
 * with another parameter at all. An index signature of an exploded object therefore also takes
 * the value types of the other keys of `query`: those keys carry their own values.
 */

function refOf(value: unknown): string | undefined {
  const ref = (value as { $ref?: unknown } | undefined)?.$ref;
  return typeof ref === "string" ? ref : undefined;
}

/** A schema `$ref` chain followed to its end, with the pointer where that schema is declared. */
function declaredSchema(schema: Schema | undefined, ref: string, context: TransformContext) {
  let declared = { schema, path: ref };
  const seen = new Set<string>();
  for (let next = refOf(schema); next !== undefined && !seen.has(next); ) {
    seen.add(next);
    declared = { schema: context.refs.resolve(next) as Schema | undefined, path: next };
    next = refOf(declared.schema);
  }
  return declared;
}

/**
 * The type of an exploded parameter whose own type is a reference (its `$ref`, or the `$ref` of
 * its schema), written out where its schema is declared: the index signature of a referenced type
 * cannot be changed. The location is the one `components` types it at, so the enums it declares
 * are the ones the reference names. Null when no `$ref` is involved.
 */
export function declaredObjectType(entry: ResolvedEntry, context: TransformContext): IrType | null {
  const { original, resolved } = entry;
  const schemaRef = refOf(resolved.schema);
  if (schemaRef !== undefined) {
    const { schema, path } = declaredSchema(resolved.schema, schemaRef, context);
    return transformSchema(schema, { path, schema }, context);
  }
  const parameterRef = refOf(original);
  return parameterRef === undefined
    ? null
    : transformSchema(resolved.schema, { path: parameterRef, schema: resolved }, context);
}

function isIndexSignature(member: IrMember): boolean {
  return member.kind === "indexSignature";
}

/** Whether the type has an index signature in its objects, through unions and intersections. */
export function hasIndexSignature(type: IrType): boolean {
  switch (type.kind) {
    case "object":
      return type.members.some(isIndexSignature);
    case "union":
    case "intersection":
      return type.types.some(hasIndexSignature);
    default:
      return false;
  }
}

function widenedMember(member: IrMember, values: readonly IrType[]): IrMember {
  // `unknown` takes every value already.
  const isUnknown = member.type.kind === "keyword" && member.type.keyword === "unknown";
  return isIndexSignature(member) && !isUnknown
    ? { ...member, type: unionOf([member.type, ...values]) }
    : member;
}

/** The type with the values added to each index signature of its objects. */
export function withIndexValues(type: IrType, values: readonly IrType[]): IrType {
  switch (type.kind) {
    case "object":
      return { ...type, members: type.members.map((member) => widenedMember(member, values)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((member) => withIndexValues(member, values)) };
    default:
      return type;
  }
}
