import { describe, expect, it } from "vitest";
import {
  OBJECT_WITH_INDEX_SIGNATURE,
  withIndexPropertyTypes,
} from "../../src/domain/index-signature-property-types.ts";

/** The golden text of an object with these member lines and an index signature of `indexType`. */
function golden(members: readonly string[], indexType: string, indent = "    "): string {
  return [
    `${indent}headers?: {`,
    ...members.map((member) => `${indent}    ${member}`),
    `${indent}} & {`,
    `${indent}    [key: string]: ${indexType};`,
    `${indent}};`,
  ].join("\n");
}

function rewrite(text: string): string {
  return text.replace(OBJECT_WITH_INDEX_SIGNATURE, (match) => withIndexPropertyTypes(match));
}

function indexLine(text: string): string | undefined {
  return text
    .split("\n")
    .find((line) => line.includes("[key: string]"))
    ?.trim();
}

describe("index signature property types", () => {
  it("withIndexPropertyTypes adds a property type that the index type does not hold", () => {
    const text = rewrite(golden(["empty?: boolean;"], "string[]"));

    expect(indexLine(text)).toBe("[key: string]: string[] | boolean;");
  });

  it("withIndexPropertyTypes adds each new member of a property union once, in order", () => {
    const text = rewrite(golden(['"@id"?: string | null;', "b: number | string;"], "string"));

    expect(indexLine(text)).toBe("[key: string]: string | null | number;");
  });

  it("withIndexPropertyTypes keeps a union inside brackets, generics and strings as one member", () => {
    const text = rewrite(golden(['a?: Record<"x" | "y", string> | (number | null)[];'], "boolean"));

    expect(indexLine(text)).toBe(
      '[key: string]: boolean | Record<"x" | "y", string> | (number | null)[];',
    );
  });

  it("withIndexPropertyTypes splits the union again after a closing bracket", () => {
    const text = rewrite(golden(["a?: Record<string, number> | boolean;"], "boolean"));

    expect(indexLine(text)).toBe("[key: string]: boolean | Record<string, number>;");
  });

  it("withIndexPropertyTypes keeps a string literal with a bar as one member", () => {
    const text = rewrite(golden(['a?: "on | off";'], "string"));

    expect(indexLine(text)).toBe("[key: string]: string;");
  });

  it("withIndexPropertyTypes adds nothing for a literal of the keyword or an array of held elements", () => {
    const members = ['a?: "on";', "b?: 2;", "c?: true;", "d?: string[];"];

    const text = rewrite(golden(members, "string | number | boolean | (string | null)[]"));

    expect(indexLine(text)).toBe("[key: string]: string | number | boolean | (string | null)[];");
  });

  it("withIndexPropertyTypes adds an array whose elements the index arrays do not hold", () => {
    const text = rewrite(golden(["a?: (string | number)[];"], "string[]"));

    expect(indexLine(text)).toBe("[key: string]: string[] | (string | number)[];");
  });

  it("withIndexPropertyTypes keeps an unknown index type, JSDoc lines and readonly members", () => {
    const members = ["/**", " * @description Flags.", " */", "readonly a?: boolean;"];
    const index = golden(members, "unknown").replace("[key: string]", "readonly [key: string]");

    expect(rewrite(index)).toBe(index);
    expect(indexLine(rewrite(golden(members, "string")))).toBe("[key: string]: string | boolean;");
  });

  it("OBJECT_WITH_INDEX_SIGNATURE leaves an object with a multi-line member unchanged", () => {
    const text = golden(["a?: {", "    b: string;", "};"], "string");

    expect(rewrite(text)).toBe(text);
  });

  it("OBJECT_WITH_INDEX_SIGNATURE rewrites an inner object of an object it does not match", () => {
    const inner = golden(["empty?: boolean;"], "string[]", "        ");
    const text = ["    outer: {", inner, "    };"].join("\n");

    expect(indexLine(rewrite(text))).toBe("[key: string]: string[] | boolean;");
  });

  it("withIndexPropertyTypes leaves a match whose member line is no property unchanged", () => {
    const text = golden(["read(): string;", "a?: boolean;"], "number");

    expect(rewrite(text)).toBe(text);
  });
});
