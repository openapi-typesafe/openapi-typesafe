import {
  irArray,
  irBoolean,
  irKeyword,
  irNumber,
  irObject,
  irProperty,
  irRaw,
  irRecord,
  irString,
  irTuple,
  irTupleElement,
} from "../../domain/ir/constructors.js";
import type { IrType } from "../../domain/ir/nodes.js";
import { toPropertyName } from "../../domain/ir/property-name.js";
import { UNKNOWN_TYPE } from "./shared-types.js";

function objectLiteralType(value: object): IrType {
  const members = Object.entries(value).map(([key, entry]) =>
    irProperty(toPropertyName(key), literalType(entry)),
  );
  return members.length > 0 ? irObject(members) : irRecord(irKeyword("string"), irKeyword("never"));
}

function arrayLiteralType(value: readonly unknown[]): IrType {
  return value.length === 0
    ? irArray(irKeyword("never"))
    : irTuple(value.map((item) => irTupleElement(literalType(item))));
}

/**
 * The literal type of a JSON value (the original `tsLiteral`): strings as JSON text, arrays as
 * tuples (an empty one as `never[]`), objects as object types (an empty one as
 * `Record<string, never>`), and anything else (`undefined`, functions) as `unknown`.
 */
export function literalType(value: unknown): IrType {
  if (typeof value === "string") {
    return irString(value, "json");
  }
  if (typeof value === "number") {
    // YAML `.nan` and `.inf` have no literal type; the original prints them as `NaN`, `-Infinity`.
    return Number.isFinite(value) ? irNumber(value) : irRaw(String(value));
  }
  if (typeof value === "boolean") {
    return irBoolean(value);
  }
  if (value === null) {
    return irKeyword("null");
  }
  if (Array.isArray(value)) {
    return arrayLiteralType(value);
  }
  return typeof value === "object" ? objectLiteralType(value) : UNKNOWN_TYPE;
}
