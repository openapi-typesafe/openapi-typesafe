import { describe, expect, it } from "vitest";
import { TypeScriptWidenedEnumValuesFinder } from "../../src/adapters/typescript-widened-enum-values-finder.ts";

/** A real TypeScript program per call; slow on a busy machine (see the identity checker tests). */
const CHECKER_TEST_TIMEOUT_MS = 30_000;

/** The helpers as golden output has them after the other intentional differences. */
const HELPERS = [
  "type FlattenedDeepRequired<T> = {",
  "    [K in keyof T]-?: FlattenedDeepRequired<T[K] extends readonly unknown[] | undefined | null" +
    " ? Extract<T[K], readonly unknown[]>[number] : NonNullable<T[K]>>;",
  "};",
  "type ReadonlyArray<T> = [Exclude<T, undefined>] extends [readonly unknown[]]" +
    " ? Readonly<Exclude<T, undefined>> : Readonly<Exclude<T, undefined>[]>;",
].join("\n");

const COMPONENTS = `export enum Kind {
    X = "x"
}
export interface components {
    schemas: {
        Pair: ["asc" | "desc", "name" | "date"];
        Status: "a" | "b";
        Text: string;
        Wide: "a" | "b" | string;
        Flag: "a" | boolean;
        Loose: "a" | unknown;
        Free: { x: unknown };
        Nums: -1 | 2 | 3;
        Tagged: "a" | Kind.X;
        Run: { status: "a" | "b" | "c" } & ({ status: "a" } | { status: "b" | "c" });
    };
}`;

const at = (name: string) => `FlattenedDeepRequired<components>["schemas"]["${name}"]`;

function arrayOf(name: string, location: string, values: string): string {
  return `export const ${name}: ReadonlyArray<${location}> = [${values}];`;
}

/** The names of the arrays the finder reports, with the values it read. */
function widenedOf(...arrays: string[]): string[] {
  const text = [HELPERS, COMPONENTS, ...arrays].join("\n");
  return new TypeScriptWidenedEnumValuesFinder().find(text).map((array) => {
    const line = text.slice(text.lastIndexOf("\n", array.typeStart) + 1, array.typeStart);
    const name = /^export const (\S+): $/.exec(line)?.[1];
    return `${name} ${array.values.join(",")}`;
  });
}

describe("TypeScriptWidenedEnumValuesFinder", { timeout: CHECKER_TEST_TIMEOUT_MS }, () => {
  it("find reports an array whose location admits other literals, booleans or unknown", () => {
    const found = widenedOf(
      arrayOf("pairValues", at("Pair"), '"asc", "desc"'),
      arrayOf("flagValues", at("Flag"), '"a"'),
      arrayOf("looseValues", at("Loose"), '"a"'),
      arrayOf("freeValues", `${at("Free")}["x"]`, '"a"'),
      arrayOf("numsValues", at("Nums"), "-1, 2"),
    );

    expect(found).toEqual([
      'pairValues "asc","desc"',
      'flagValues "a"',
      'looseValues "a"',
      'freeValues "a"',
      "numsValues -1,2",
    ]);
  });

  it("find reads an intersection of literals as TypeScript reduces it", () => {
    const location = `Extract<${at("Run")}, { status: unknown }>["status"]`;

    expect(widenedOf(arrayOf("runValues", location, '"a"'))).toEqual(['runValues "a"']);
  });

  it("find keeps an array whose location admits exactly its values or a wide type", () => {
    const found = widenedOf(
      arrayOf("statusValues", at("Status"), '"a", "b"'),
      arrayOf("textValues", at("Text"), '"a"'),
      arrayOf("wideValues", at("Wide"), '"a"'),
      arrayOf("taggedValues", at("Tagged"), '"a"'),
      arrayOf("ownValues", '"a" | "x"', '"a"'),
    );

    expect(found).toEqual(['ownValues "a"']);
  });

  it("find keeps an array whose location does not admit its values", () => {
    expect(widenedOf(arrayOf("statusValues", at("Status"), '"a", "z"'))).toEqual([]);
  });

  it("find skips arrays of other types or values that are not literals", () => {
    const found = widenedOf(
      `export const plain: readonly string[] = ["a"];`,
      `export const listed: Array<"a" | "z"> = ["a"];`,
      arrayOf("namedValues", at("Pair"), "plain[0]"),
      `export const inferred = ["a"];`,
    );

    expect(found).toEqual([]);
  });

  it("find returns nothing for a text without arrays", () => {
    expect(new TypeScriptWidenedEnumValuesFinder().find(COMPONENTS)).toEqual([]);
  });

  it("find gives the offsets of the declared type", () => {
    const array = arrayOf("pairValues", at("Pair"), '"asc", "desc"');
    const text = [HELPERS, COMPONENTS, array].join("\n");

    const [found] = new TypeScriptWidenedEnumValuesFinder().find(text);

    expect(text.slice(found?.typeStart, found?.typeEnd)).toBe(`ReadonlyArray<${at("Pair")}>`);
  });
});
