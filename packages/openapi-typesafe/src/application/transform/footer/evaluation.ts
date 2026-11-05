import type { IrPropertyName, IrType } from "../../../domain/ir/nodes.js";

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

export function propertyKey(name: IrPropertyName): string {
  return name.kind === "string" ? name.value : name.text;
}
