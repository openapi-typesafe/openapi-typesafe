import ts from "typescript";
import { describe, expect, it } from "vitest";
import { irProperty, irReference } from "../../src/domain/ir/constructors.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";
import {
  createTransformContext,
  UnreadablePropertyError,
} from "../../src/lib/transform-context.js";
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

    expect(() => callbacks.transformProperty(PROPERTY, {}, LOCATION)).toThrow(
      UnreadablePropertyError,
    );
    expect(() => callbacks.transformProperty(PROPERTY, {}, LOCATION)).toThrow(
      `transformProperty at ${LOCATION.path} returned a property`,
    );
  });

  it("transformProperty without a callback result returns null", () => {
    const { callbacks } = createTransformContext(
      contextWith({ transformProperty: () => undefined }),
    );

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
