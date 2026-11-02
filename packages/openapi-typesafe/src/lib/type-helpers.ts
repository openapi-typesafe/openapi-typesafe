import type ts from "typescript";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import { fromTypeNode } from "../adapters/type-ast-bridge/typescript-to-ir.js";
import { HELPER_TYPES } from "../application/transform/footer/helper-types.js";
import { literalType } from "../application/transform/literal-type.js";
import { refType } from "../application/transform/ref-type.js";
import { UNKNOWN_TYPE } from "../application/transform/shared-types.js";
import {
  intersectionOf,
  nullableOf,
  omitKeys,
  unionOf,
  withRequiredKeys,
} from "../application/transform/type-combinators.js";
import { irBoolean, irKeyword, irRecord } from "../domain/ir/constructors.js";
import type { IrType } from "../domain/ir/nodes.js";
import type { ParameterObject, ReferenceObject } from "../types.js";
import { declaresTypeAlias, type FooterEntry } from "./footer-entry.js";

/**
 * The public type helpers (ENGINEERING_PLAN 6.2, ADR-004 decision 2). Same names and call
 * signatures as the original helpers; they return IR types. A `ts.TypeNode` argument (from user
 * code built with `ts.factory`) is read into IR by the bridge.
 */

/** A helper argument: an IR type, or a TypeScript type node from user code. */
export type TypeInput = IrType | ts.TypeNode;

export const BOOLEAN: IrType = Object.freeze(irKeyword("boolean"));
export const FALSE: IrType = Object.freeze(irBoolean(false));
export const NEVER: IrType = Object.freeze(irKeyword("never"));
export const NULL: IrType = Object.freeze(irKeyword("null"));
export const NUMBER: IrType = Object.freeze(irKeyword("number"));
export const STRING: IrType = Object.freeze(irKeyword("string"));
export const TRUE: IrType = Object.freeze(irBoolean(true));
export const UNDEFINED: IrType = Object.freeze(irKeyword("undefined"));
/** The shared `unknown` type; the transformers compare with it by identity, as the original did. */
export const UNKNOWN: IrType = UNKNOWN_TYPE;

/** IR nodes have a string `kind`; TypeScript nodes have a numeric `SyntaxKind`. */
function isIrType(type: TypeInput): type is IrType {
  return typeof type.kind === "string";
}

/** @internal Read a helper argument into IR. */
export function toIrType(type: TypeInput): IrType {
  return isIrType(type) ? type : fromTypeNode(loadTypeScript(), type);
}

/** `A | B`: `never` for no types, the type itself for one; repeated primitives are removed. */
export function tsUnion(types: readonly TypeInput[]): IrType {
  return unionOf(types.map(toIrType));
}

/** `A & B`, with the same rules as `tsUnion`. */
export function tsIntersection(types: readonly TypeInput[]): IrType {
  return intersectionOf(types.map(toIrType));
}

/** `A | null`, without removing repeated types. */
export function tsNullable(types: readonly TypeInput[]): IrType {
  return nullableOf(types.map(toIrType));
}

/** `Omit<T, "a" | "b">`. */
export function tsOmit(type: TypeInput, keys: readonly string[]): IrType {
  return omitKeys(toIrType(type), keys);
}

/** `Record<K, V>`. */
export function tsRecord(key: TypeInput, value: TypeInput): IrType {
  return irRecord(toIrType(key), toIrType(value));
}

/**
 * The literal type of a JSON value: strings, numbers, booleans and `null` as literals, arrays as
 * tuples (an empty one as `never[]`), objects as object types; anything else is `unknown`.
 */
export function tsLiteral(value: unknown): IrType {
  return literalType(value);
}

/**
 * `WithRequired<T, "a" | "b">`, or the type itself for no keys. Adds the `WithRequired` helper
 * type to the footer once.
 */
export function tsWithRequired(type: TypeInput, keys: readonly string[], injectFooter: FooterEntry[]): IrType {
  if (keys.length === 0) {
    return toIrType(type);
  }
  const { name, text } = HELPER_TYPES.withRequired;
  if (!injectFooter.some((entry) => declaresTypeAlias(entry, name))) {
    injectFooter.push({ kind: "rawDeclaration", name, text });
  }
  return withRequiredKeys(toIrType(type), keys);
}

export interface OapiRefOptions {
  /** Whether to wrap with FlattenedDeepRequired<> (default: false) */
  deep?: boolean;
  /** Array of property names to wrap with Extract<> when accessing */
  extractProperties?: string[];
}

function isParameterObject(value: ParameterObject | ReferenceObject | undefined): value is ParameterObject {
  return Boolean(value && !("$ref" in value && value.$ref) && (value as ParameterObject).in);
}

/**
 * The generated type a JSON Pointer refers to, as an indexed access: `#/components/schemas/Foo`
 * → `components["schemas"]["Foo"]`. Object `properties` are skipped, and a referenced parameter
 * is indexed by its location (`resolved`).
 */
export function oapiRef(
  path: string,
  resolved?: ParameterObject | ReferenceObject,
  options: OapiRefOptions = {},
): IrType {
  return refType(path, {
    isDeep: options.deep ?? false,
    extractProperties: options.extractProperties ?? [],
    parameter: isParameterObject(resolved) ? { in: resolved.in, name: resolved.name } : null,
  });
}
