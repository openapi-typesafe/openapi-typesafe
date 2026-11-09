import { describe, expect, it } from "vitest";
import { isPrintableIrProperty, isPrintableIrType } from "../../../src/domain/ir/ir-shape.js";

const STRING = { kind: "keyword", keyword: "string" } as const;

function property(fields: Record<string, unknown> = {}) {
  return {
    kind: "property",
    name: { kind: "identifier", text: "a" },
    type: STRING,
    isOptional: false,
    isReadonly: false,
    comments: [],
    ...fields,
  };
}

describe("isPrintableIrType", () => {
  it.each([
    ["a keyword", STRING],
    ["a string literal", { kind: "stringLiteral", value: "x", encoding: "escaped" }],
    ["a number literal", { kind: "numberLiteral", value: -1 }],
    ["a boolean literal", { kind: "booleanLiteral", value: true }],
    [
      "a reference with arguments",
      { kind: "reference", name: "Record", typeArguments: [STRING, STRING] },
    ],
    ["a generated reference name", { kind: "reference", name: "typeof Status", typeArguments: [] }],
    ["a qualified reference name", { kind: "reference", name: "Status.active", typeArguments: [] }],
    ["a qualified type query", { kind: "reference", name: "typeof A.b", typeArguments: [] }],
    ["a reserved word after a dot", { kind: "reference", name: "A.class", typeArguments: [] }],
    [
      "a type operator in a type query",
      { kind: "reference", name: "typeof keyof", typeArguments: [] },
    ],
    ["a predefined type name", { kind: "reference", name: "string", typeArguments: [] }],
    ["an array", { kind: "array", element: STRING }],
    [
      "a tuple",
      {
        kind: "tuple",
        elements: [
          { type: STRING, isRest: false, isOptional: true },
          { type: STRING, isRest: true, isOptional: false },
        ],
      },
    ],
    ["a union", { kind: "union", types: [STRING, { kind: "keyword", keyword: "null" }] }],
    ["an intersection", { kind: "intersection", types: [STRING] }],
    [
      "an object with members",
      {
        kind: "object",
        members: [
          property({
            comments: [
              { kind: "block", text: "* doc " },
              { kind: "line", text: " note" },
            ],
          }),
          {
            kind: "indexSignature",
            parameterName: "key",
            parameterType: STRING,
            type: STRING,
            isReadonly: true,
            comments: [],
          },
        ],
      },
    ],
    [
      "an indexed access",
      { kind: "indexedAccess", object: STRING, index: { kind: "stringLiteral", value: "a" } },
    ],
    ["a readonly type", { kind: "readonly", type: { kind: "array", element: STRING } }],
    ["raw text", { kind: "raw", text: "Date" }],
  ])("isPrintableIrType of %s is true", (_name, value) => {
    expect(isPrintableIrType(value)).toBe(true);
  });

  it.each([
    ["an empty object (G12)", {}],
    ["a number", 42],
    ["null", null],
    ["an unknown kind", { kind: "conditional" }],
    ["a kind inherited from Object", { kind: "toString" }],
    ["an unknown keyword", { kind: "keyword", keyword: "any" }],
    [
      "a string literal with an unknown encoding",
      { kind: "stringLiteral", value: "x", encoding: "html" },
    ],
    ["an infinite number", { kind: "numberLiteral", value: Number.POSITIVE_INFINITY }],
    ["a boolean literal of text", { kind: "booleanLiteral", value: "true" }],
    ["a reference without a name", { kind: "reference", name: " ", typeArguments: [] }],
    ["a reference without arguments", { kind: "reference", name: "A" }],
    ["a reference name with a space", { kind: "reference", name: "a b", typeArguments: [] }],
    ["an empty reference name", { kind: "reference", name: "", typeArguments: [] }],
    [
      "a reference name with arguments in it",
      { kind: "reference", name: "A<B>", typeArguments: [] },
    ],
    [
      "a reference name with an empty segment",
      { kind: "reference", name: "A..b", typeArguments: [] },
    ],
    [
      "a reference name that starts with a digit",
      { kind: "reference", name: "1A", typeArguments: [] },
    ],
    ["a bare type query", { kind: "reference", name: "typeof ", typeArguments: [] }],
    ["an import type query", { kind: "reference", name: "typeof import", typeArguments: [] }],
    [
      "a strict mode word in a type query",
      { kind: "reference", name: "typeof let.a", typeArguments: [] },
    ],
    ["a reference name that is no text", { kind: "reference", name: 1, typeArguments: [] }],
    ["an empty union", { kind: "union", types: [] }],
    ["a union with a bad member", { kind: "union", types: [STRING, {}] }],
    [
      "a tuple element both rest and optional",
      { kind: "tuple", elements: [{ type: STRING, isRest: true, isOptional: true }] },
    ],
    ["a tuple without elements", { kind: "tuple" }],
    ["an object without members", { kind: "object" }],
    ["an object with a bad member", { kind: "object", members: [{ kind: "method" }] }],
    ["blank raw text (G12)", { kind: "raw", text: "" }],
  ])("isPrintableIrType of %s is false", (_name, value) => {
    expect(isPrintableIrType(value)).toBe(false);
  });

  it.each(["keyof", "infer", "unique", "readonly", "new", "typeof", "import", "let", "yield"])(
    "isPrintableIrType of a reference named %s, which TypeScript reads as no type name, is false",
    (name) => {
      expect(isPrintableIrType({ kind: "reference", name, typeArguments: [] })).toBe(false);
    },
  );

  const indexSignatureOf = (parameterType: unknown) => ({
    kind: "object",
    members: [
      {
        kind: "indexSignature",
        parameterName: "k",
        parameterType,
        type: STRING,
        isReadonly: false,
        comments: [],
      },
    ],
  });

  it.each([
    [
      "an indexed access",
      {
        kind: "indexedAccess",
        object: { kind: "reference", name: "K", typeArguments: [] },
        index: { kind: "stringLiteral", value: "a" },
      },
    ],
    ["a tagged string", { kind: "intersection", types: [STRING, { kind: "object", members: [] }] }],
    [
      "a tag before the string",
      { kind: "intersection", types: [{ kind: "object", members: [] }, STRING] },
    ],
  ])(
    "isPrintableIrType of an index signature with %s as its parameter type is true",
    (_name, type) => {
      expect(isPrintableIrType(indexSignatureOf(type))).toBe(true);
    },
  );

  it.each([
    ["an object", { kind: "object", members: [] }],
    [
      "an intersection of objects",
      { kind: "intersection", types: [{ kind: "object", members: [] }] },
    ],
    ["a literal", { kind: "stringLiteral", value: "a" }],
    [
      "a union with an array",
      { kind: "union", types: [STRING, { kind: "array", element: STRING }] },
    ],
    ["the keyword null", { kind: "keyword", keyword: "null" }],
  ])(
    "isPrintableIrType of an index signature with %s as its parameter type is false",
    (_name, parameterType) => {
      const member = {
        kind: "indexSignature",
        parameterName: "k",
        parameterType,
        type: STRING,
        isReadonly: false,
        comments: [],
      };

      expect(isPrintableIrType({ kind: "object", members: [member] })).toBe(false);
    },
  );

  it("isPrintableIrType of a type that contains itself is false instead of recursing forever", () => {
    const types: unknown[] = [STRING];
    const union = { kind: "union", types };
    types.push(union);

    expect(isPrintableIrType(union)).toBe(false);
  });

  it("isPrintableIrType accepts one node used twice, which is no cycle", () => {
    expect(isPrintableIrType({ kind: "union", types: [STRING, STRING] })).toBe(true);
  });
});

describe("isPrintableIrProperty", () => {
  it.each([
    ["a quoted name", property({ name: { kind: "string", value: "a-b" } })],
    ["a number name", property({ name: { kind: "number", text: "12" } })],
    ["a Unicode identifier", property({ name: { kind: "identifier", text: "naïve" } })],
  ])("isPrintableIrProperty of a property with %s is true", (_name, value) => {
    expect(isPrintableIrProperty(value)).toBe(true);
  });

  it.each([
    ["only a name (G12)", { name: "a" }],
    [
      "an identifier that is no identifier",
      property({ name: { kind: "identifier", text: "a-b" } }),
    ],
    ["a negative number name", property({ name: { kind: "number", text: "-1" } })],
    ["a name of an unknown kind", property({ name: { kind: "computed" } })],
    ["no name", property({ name: undefined })],
    ["a bad type", property({ type: { kind: "raw", text: "  " } })],
    ["isOptional as text", property({ isOptional: "yes" })],
    ["comments that are no list", property({ comments: "doc" })],
    [
      "a block comment that ends itself",
      property({ comments: [{ kind: "block", text: "a */ b" }] }),
    ],
    ["a line comment over two lines", property({ comments: [{ kind: "line", text: "a\nb" }] })],
    ["a comment of an unknown kind", property({ comments: [{ kind: "jsdoc", text: "a" }] })],
    ["a comment without text", property({ comments: [{ kind: "line" }] })],
  ])("isPrintableIrProperty of a property with %s is false", (_name, value) => {
    expect(isPrintableIrProperty(value)).toBe(false);
  });

  it("isPrintableIrProperty of an index signature with a bad parameter name is false in an object", () => {
    const member = {
      kind: "indexSignature",
      parameterName: "a b",
      parameterType: STRING,
      type: STRING,
      isReadonly: false,
      comments: [],
    };

    expect(isPrintableIrType({ kind: "object", members: [member] })).toBe(false);
  });
});
