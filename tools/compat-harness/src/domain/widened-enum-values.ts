/**
 * `--enum-values` arrays typed by a location that admits more than their values: a tuple element
 * or a union member read through `FlattenedDeepRequired` also admits its siblings' values. The
 * current generator types such an array by its own values; the golden one kept the location.
 */

/** An `--enum-values` array the rule retypes, as the golden text holds it. */
export interface WidenedEnumValuesArray {
  /** Offsets of the declared type (`ReadonlyArray<FlattenedDeepRequired<…>…>`) in the text. */
  readonly typeStart: number;
  readonly typeEnd: number;
  /** The array's values as the text prints them (`"asc"`, `5`, `-1`), in order. */
  readonly values: readonly string[];
}

/**
 * Finds the arrays of a generated file whose location type admits all of their values and surely
 * admits another one too: a string or number literal not listed, `true`, `false` or `unknown`.
 */
export type WidenedEnumValuesFinder = (text: string) => readonly WidenedEnumValuesArray[];

/** The declared type the generator gives such an array: only its values, `never` without any. */
function ownValuesType(values: readonly string[]): string {
  const distinct = [...new Set(values)];
  // `ReadonlyArray<never>` is `never` (`never` extends an array), so it would not even take `[]`.
  return distinct.length === 0 ? "readonly never[]" : `ReadonlyArray<${distinct.join(" | ")}>`;
}

/**
 * Only an array typed by its location can be retyped (`ReadonlyArray<FlattenedDeepRequired<…` or
 * `ReadonlyArray<Extract<FlattenedDeepRequired<…`); a text without one needs no checker.
 */
const LOCATION_TYPED_ARRAY =
  /^export const [^:\n]+: ReadonlyArray<(?:Extract<)*FlattenedDeepRequired</m;

/** The text with each array that `find` reports typed by its own values. */
export function withOwnValuesTypes(text: string, find: WidenedEnumValuesFinder): string {
  if (!LOCATION_TYPED_ARRAY.test(text)) {
    return text;
  }
  const arrays = [...find(text)].sort((first, second) => second.typeStart - first.typeStart);
  let rewritten = text;
  for (const { typeStart, typeEnd, values } of arrays) {
    rewritten = rewritten.slice(0, typeStart) + ownValuesType(values) + rewritten.slice(typeEnd);
  }
  return rewritten;
}
