import type { IrPropertyName, IrTupleType, IrType } from "../../../domain/ir/nodes.js";

/** The values the evaluator of the `--enum-values` check works with (ADR-027). */

/** A type as evaluated: `deep` is set inside `FlattenedDeepRequired`. */
export interface Evaluated {
  readonly kind: "type";
  readonly type: IrType;
  readonly deep: boolean;
}

export type Evaluation = Evaluated | { readonly kind: "missing" } | { readonly kind: "opaque" };

export const MISSING: Evaluation = { kind: "missing" };
export const OPAQUE: Evaluation = { kind: "opaque" };

export const NEVER: IrType = { kind: "keyword", keyword: "never" };

export function unionType(types: readonly IrType[]): IrType {
  if (types.length === 1) {
    return types[0] as IrType;
  }
  return types.length === 0 ? NEVER : { kind: "union", types };
}

export function intersectionType(types: readonly IrType[]): IrType {
  return types.length === 1 ? (types[0] as IrType) : { kind: "intersection", types };
}

const NULLISH: ReadonlySet<string> = new Set(["null", "undefined"]);

export function isNullish(type: IrType): boolean {
  return type.kind === "keyword" && NULLISH.has(type.keyword);
}

const UNDEFINED: IrType = { kind: "keyword", keyword: "undefined" };

/**
 * A tuple as the array of its items: `T[number]` is the union of its elements, `undefined` for an
 * optional one, and the item type of a rest element. `FlattenedDeepRequired` reads a tuple member
 * only through `[number]`, so inside it this is the same type. Null for a rest element whose type
 * is not an array type.
 */
export function tupleAsArray(tuple: IrTupleType): IrType | null {
  const items: IrType[] = [];
  for (const element of tuple.elements) {
    if (element.isRest && element.type.kind !== "array") {
      return null;
    }
    const item =
      element.isRest && element.type.kind === "array" ? element.type.element : element.type;
    items.push(item, ...(element.isOptional ? [UNDEFINED] : []));
  }
  return { kind: "array", element: unionType(items) };
}

export function propertyKey(name: IrPropertyName): string {
  return name.kind === "string" ? name.value : name.text;
}

function isKeyword(member: Evaluation, keyword: string): boolean {
  return (
    member.kind === "type" && member.type.kind === "keyword" && member.type.keyword === keyword
  );
}

/**
 * Union members as TypeScript reduces them: `any` absorbs every member, `unknown` every member
 * but `any`, so `{ a: X } | unknown` is `unknown`. An opaque member may be `any`.
 */
export function absorbed(members: readonly Evaluation[]): readonly Evaluation[] {
  const any = members.find((member) => isKeyword(member, "any"));
  const unknown = members.find((member) => isKeyword(member, "unknown"));
  if (any !== undefined || unknown === undefined) {
    return any === undefined ? members : [any];
  }
  return members.some((member) => member.kind !== "type") ? [OPAQUE] : [unknown];
}
