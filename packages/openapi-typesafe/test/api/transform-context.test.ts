import ts from "typescript";
import { describe, expect, it } from "vitest";
import { UnreadablePropertyError, UnreadableTypeError } from "../../src/api/schema-callbacks.js";
import { createTransformContext } from "../../src/api/transform-context.js";
import { irKeyword, irProperty, irReference } from "../../src/domain/ir/constructors.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";
import type { GlobalContext } from "../../src/types.js";
import { DEFAULT_CTX } from "../test-helpers.js";

const LOCATION = { path: "#/components/schemas/Root/properties/a" };
const PROPERTY = irProperty(toPropertyName("a"), irReference("A"));

function contextWith(overrides: Partial<GlobalContext>): GlobalContext {
  return { ...DEFAULT_CTX, injectFooter: [], ...overrides } as GlobalContext;
}

describe("createTransformContext", () => {
  it("transformProperty with a result the IR cannot read throws UnreadablePropertyError", () => {
    const transformProperty = (property: ts.PropertySignature) =>
      ts.factory.updatePropertySignature(
        property,
        [ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
        property.name,
        undefined,
        property.type,
      );
    const { callbacks } = createTransformContext(contextWith({ transformProperty }));

    expect(() => callbacks.transformProperty(PROPERTY, {}, LOCATION)).toThrow(UnreadablePropertyError);
    expect(() => callbacks.transformProperty(PROPERTY, {}, LOCATION)).toThrow(
      `transformProperty at ${LOCATION.path} returned a property`,
    );
  });

  it.each([
    [
      "an index signature",
      ts.factory.createIndexSignature(undefined, [], ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)),
    ],
    ["a type node", ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)],
    ["a string", "a: string"],
  ])("transformProperty that returns %s throws UnreadablePropertyError", (_, result) => {
    const transformProperty = () => result;
    const { callbacks } = createTransformContext(contextWith({ transformProperty } as never));

    expect(() => callbacks.transformProperty(PROPERTY, {}, LOCATION)).toThrow(UnreadablePropertyError);
  });

  it.each([
    ["a plain object", { a: 1 }],
    ["an object with a non-node schema", { schema: "string" }],
  ])("transform that returns %s throws UnreadableTypeError", (_, result) => {
    const { callbacks } = createTransformContext(contextWith({ transform: () => result } as never));

    expect(() => callbacks.transform({}, LOCATION)).toThrow(UnreadableTypeError);
    expect(() => callbacks.transform({}, LOCATION)).toThrow(
      `transform at ${LOCATION.path} returned a value that is not a TypeScript node`,
    );
  });

  it("transform that returns text keeps the default type, as in openapi-typescript", () => {
    const { callbacks } = createTransformContext(contextWith({ transform: () => "x" } as never));

    expect(callbacks.transform({}, LOCATION)).toBeNull();
  });

  it.each([
    ["a string", "x"],
    ["a number", 5],
    ["a plain object", { a: 1 }],
  ])("postTransform that returns %s throws UnreadableTypeError", (_, result) => {
    const context = contextWith({ postTransform: () => result } as never);
    const { callbacks } = createTransformContext(context);

    expect(() => callbacks.postTransform(irKeyword("string"), LOCATION)).toThrow(UnreadableTypeError);
  });

  it("transformProperty without a callback result returns null", () => {
    const { callbacks } = createTransformContext(contextWith({ transformProperty: () => undefined }));

    expect(callbacks.transformProperty(PROPERTY, {}, LOCATION)).toBeNull();
  });

  it("transform with a bare type node result is not optional", () => {
    const transform = () => ts.factory.createTypeReferenceNode("Blob");
    const { callbacks } = createTransformContext(contextWith({ transform }));

    expect(callbacks.transform({}, LOCATION)).toEqual({
      type: irReference("Blob"),
      isOptional: false,
    });
  });
});
