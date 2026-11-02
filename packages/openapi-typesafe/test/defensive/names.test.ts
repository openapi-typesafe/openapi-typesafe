import { describe, expect, it } from "vitest";
import { UNSUPPORTED_KEYS } from "../../src/adapters/redocly-loader/unsupported-keys.js";
import { documentWith, generateCompiling, generationFailure } from "./defensive-helpers.js";

/** Names that are special to JavaScript objects or reserved in TypeScript. */
const RESERVED_NAMES = [
  "constructor",
  "prototype",
  "toString",
  "class",
  "default",
  "delete",
  "enum",
  "function",
  "interface",
  "keyof",
  "never",
  "new",
  "null",
  "type",
  "typeof",
  "undefined",
  "unknown",
  "void",
  "Array",
  "Date",
  "Object",
  "Promise",
  "Record",
  "String",
];

/** Names that need quoting, escaping or careful string handling. */
const UNUSUAL_NAMES = [
  "emoji 🚀",
  "名前",
  "שם",
  "é",
  "👩‍💻",
  "line separator",
  'double"quote',
  "single'quote",
  "back\\slash",
  "new\nline",
  "with space",
  "kebab-case",
  "1starts-with-digit",
  "$dollar",
  "",
];

const STRING = { type: "string" };

/** An object schema with one required string property per name. */
function objectWith(names: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(names.map((name) => [name, STRING])),
    required: [...names],
  };
}

/** One component schema per name, each also used as a property name and an enum value. */
function documentNaming(names: readonly string[]): Record<string, unknown> {
  const schemas = Object.fromEntries(names.map((name) => [name, objectWith(names)]));
  return documentWith({ ...schemas, Values: { type: "string", enum: [...names] } });
}

describe("names", () => {
  it("reserved words as component, property and enum names compile", async () => {
    const output = await generateCompiling(documentNaming(RESERVED_NAMES));

    expect(output).toContain("constructor: string;");
    expect(output).toContain('"constructor" | "prototype" | "toString"');
  });

  it("Unicode, quotes, backslashes and line breaks in names compile", async () => {
    const output = await generateCompiling(documentNaming(UNUSUAL_NAMES));

    expect(output).toContain('"double\\"quote": string;');
    expect(output).toContain('"back\\\\slash": string;');
    expect(output).toContain('"new\\nline": string;');
  });

  it("__proto__ as a property and a schema name compiles and keeps the key", async () => {
    // JSON.parse creates an own "__proto__" key; an object literal would set the prototype.
    const document = JSON.parse(
      JSON.stringify(documentWith({ Holder: objectWith(["x"]) })).replace(
        '"Holder"',
        '"__proto__":{"type":"object","properties":{"__proto__":{"type":"string"}}},"Holder"',
      ),
    );

    const output = await generateCompiling(document);

    expect(output).toMatch(/"?__proto__"?: \{/);
    expect(output).toMatch(/"?__proto__"?\?: string;/);
  });

  it("reserved and unusual names in paths, parameters and operation ids compile", async () => {
    const parameters = [...RESERVED_NAMES, ...UNUSUAL_NAMES.filter(Boolean)].map((name) => ({
      name,
      in: "query",
      schema: STRING,
    }));
    const operation = { operationId: "delete", parameters, responses: { 204: { description: "" } } };

    await generateCompiling(documentWith({}, { "/名前/{class}/🚀": { get: operation } }));
  });

  it.each([...UNSUPPORTED_KEYS])("%s as a property name fails with SCHEMA_KEY_UNSUPPORTED", async (key) => {
    const error = await generationFailure(documentWith({ Holder: objectWith([key]) }));

    expect(error).toMatchObject({
      code: "SCHEMA_KEY_UNSUPPORTED",
      details: { keys: [{ key, pointer: `#/components/schemas/Holder/properties/${key}` }] },
    });
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("an unsupported key in a value Redocly does not walk generates", async () => {
    const holder = { type: "object", default: { valueOf: 1 }, const: { hasOwnProperty: 1 } };

    await generateCompiling(documentWith({ Holder: holder }));
  });
});
