import { describe, expect, it } from "vitest";
import {
  type WidenedEnumValuesFinder,
  withOwnValuesTypes,
} from "../../src/domain/widened-enum-values.ts";

const LOCATION = 'ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Pair"]>';
const PAIR = `export const pairValues: ${LOCATION} = ["asc", "desc"];`;
const PAIR_2 = `export const pairValues_2: ${LOCATION} = ["name", "date"];`;

/** A finder that reports each declared type of `LOCATION` in the text with the given values. */
function findingValues(...valueLists: string[][]): WidenedEnumValuesFinder {
  return (text) => {
    const found = [];
    let from = 0;
    for (const values of valueLists) {
      const typeStart = text.indexOf(LOCATION, from);
      found.push({ typeStart, typeEnd: typeStart + LOCATION.length, values });
      from = typeStart + LOCATION.length;
    }
    return found;
  };
}

const NOTHING_TO_FIND: WidenedEnumValuesFinder = () => {
  throw new Error("the finder must not run");
};

describe("withOwnValuesTypes", () => {
  it("withOwnValuesTypes types each reported array by its own values", () => {
    const text = `${PAIR}\n${PAIR_2}`;

    const rewritten = withOwnValuesTypes(text, findingValues(['"asc"', '"desc"'], ['"name"']));

    expect(rewritten.split("\n")).toEqual([
      'export const pairValues: ReadonlyArray<"asc" | "desc"> = ["asc", "desc"];',
      'export const pairValues_2: ReadonlyArray<"name"> = ["name", "date"];',
    ]);
  });

  it("withOwnValuesTypes lists a repeated value once", () => {
    const rewritten = withOwnValuesTypes(PAIR, findingValues(["1", "-1", "1"]));

    expect(rewritten).toBe('export const pairValues: ReadonlyArray<1 | -1> = ["asc", "desc"];');
  });

  it("withOwnValuesTypes types an array without values as a readonly never array", () => {
    const rewritten = withOwnValuesTypes(PAIR, findingValues([]));

    expect(rewritten).toBe('export const pairValues: readonly never[] = ["asc", "desc"];');
  });

  it("withOwnValuesTypes keeps the text when the finder reports nothing", () => {
    expect(withOwnValuesTypes(PAIR, () => [])).toBe(PAIR);
  });

  it("withOwnValuesTypes does not run the finder on a text without a location-typed array", () => {
    const text = 'export const pairValues: ReadonlyArray<"asc"> = ["asc"];\ntype A = 1;';

    expect(withOwnValuesTypes(text, NOTHING_TO_FIND)).toBe(text);
  });

  it("withOwnValuesTypes runs the finder on an array typed through Extract", () => {
    const location = 'FlattenedDeepRequired<components>["schemas"]["Pair"]';
    const extracted = PAIR.replace(location, `Extract<${location}, { a: unknown }>["a"]`);

    expect(withOwnValuesTypes(extracted, () => [])).toBe(extracted);
    expect(() => withOwnValuesTypes(extracted, NOTHING_TO_FIND)).toThrow("must not run");
  });
});
