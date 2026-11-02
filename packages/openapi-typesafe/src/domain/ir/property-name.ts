import type { IrPropertyName } from "./nodes.js";

/** A name that can be written without quotes. */
export const JS_PROPERTY_INDEX_RE = /^[A-Za-z_$][A-Za-z_$0-9]*$/;

function isNonNegativeNumberText(index: string): boolean {
  return String(Number(index)) === index && index[0] !== "-";
}

/**
 * Choose how a property key is written, following the original `tsPropertyIndex`: non-negative
 * numbers (and strings that are exactly such a number) unquoted, valid identifiers unquoted,
 * everything else as a quoted string. Negative numbers become strings because `-1` is not a valid
 * property key.
 */
export function toPropertyName(index: string | number): IrPropertyName {
  if (typeof index === "number") {
    return index < 0
      ? { kind: "string", value: String(index) }
      : { kind: "number", text: String(index) };
  }
  if (isNonNegativeNumberText(index)) {
    return { kind: "number", text: index };
  }
  return JS_PROPERTY_INDEX_RE.test(index)
    ? { kind: "identifier", text: index }
    : { kind: "string", value: index };
}
