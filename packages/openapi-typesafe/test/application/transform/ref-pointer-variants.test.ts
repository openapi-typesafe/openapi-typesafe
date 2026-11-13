import { describe, expect, it } from "vitest";
import {
  type GeneratedMember,
  intersectionMember,
  MISSING,
  OPAQUE,
  variantsMember,
} from "../../../src/application/transform/ref-pointer/generated-member.js";
import {
  generatedMember,
  isMissingComposedKey,
} from "../../../src/application/transform/ref-pointer/generated-shape.js";
import { variantsFormOf } from "../../../src/application/transform/ref-pointer/variants-form.js";
import type {
  RefResolver,
  SchemaOptions,
} from "../../../src/application/transform/schema/schema-context.js";
import { FIX } from "../../../src/domain/output-fixes.js";
import { DEFAULT_TRANSFORM_OPTIONS } from "../../fakes/transform-context.js";

/** How the `$ref` pointer walk reads own properties next to `anyOf` / `oneOf` (ADR-026). */

const OPTIONS: SchemaOptions = DEFAULT_TRANSFORM_OPTIONS;
const withFix = (fix: (typeof FIX)[keyof typeof FIX]): SchemaOptions => ({
  ...OPTIONS,
  fixes: new Set([fix]),
});
const COMPONENT = { $ref: "#/components/schemas/Cat" };
const OBJECT = { type: "object", properties: { meow: { type: "boolean" } } };
const STRING = { type: "string", minLength: 1 };
const property = (isOptional: boolean): GeneratedMember => ({
  kind: "property",
  node: {},
  location: undefined,
  isOptional,
  isMarked: false,
});
const NO_REFS: RefResolver = { resolve: () => undefined };

describe("variantsFormOf", () => {
  it("variantsFormOf of oneOf with a component or object variant is an intersection", () => {
    expect(variantsFormOf({ oneOf: [COMPONENT, STRING] }, OPTIONS)).toBe("intersection");
    expect(variantsFormOf({ oneOf: [OBJECT] }, OPTIONS)).toBe("intersection");
    expect(variantsFormOf({ oneOf: [{ type: "array" }] }, OPTIONS)).toBe("intersection");
  });

  it("variantsFormOf of oneOf of primitives only is a union", () => {
    expect(variantsFormOf({ oneOf: [STRING, { type: "null" }] }, OPTIONS)).toBe("union");
  });

  it("variantsFormOf of oneOf it cannot read is unknown", () => {
    expect(variantsFormOf({ oneOf: [{ type: "string", enum: ["a"] }] }, OPTIONS)).toBe("unknown");
    expect(
      variantsFormOf({ oneOf: [{ $ref: "#/components/schemas/Cat/properties/a" }] }, OPTIONS),
    ).toBe("unknown");
    expect(variantsFormOf({ oneOf: [{ type: "object" }] }, OPTIONS)).toBe("unknown");
  });

  it("variantsFormOf with --binary-as-blob counts a formatted string as unknown", () => {
    const blob = { ...OPTIONS, binaryAsBlob: true };

    expect(variantsFormOf({ oneOf: [{ type: "string", format: "binary" }] }, blob)).toBe("unknown");
    expect(variantsFormOf({ oneOf: [STRING] }, blob)).toBe("union");
  });

  it("variantsFormOf of anyOf is a union, and an intersection with anyof-properties", () => {
    expect(variantsFormOf({ anyOf: [COMPONENT] }, OPTIONS)).toBe("union");
    expect(variantsFormOf({ anyOf: [COMPONENT] }, withFix(FIX.ANYOF_PROPERTIES))).toBe(
      "intersection",
    );
  });

  it("variantsFormOf of both keywords or a type list is unknown", () => {
    expect(variantsFormOf({ anyOf: [COMPONENT], oneOf: [COMPONENT] }, OPTIONS)).toBe("unknown");
    expect(variantsFormOf({ type: ["object", "string"], anyOf: [COMPONENT] }, OPTIONS)).toBe(
      "unknown",
    );
  });

  it("variantsFormOf with anyof-oneof-required and required-only variants is unknown", () => {
    const required = { anyOf: [{ required: ["a"] }] };

    expect(variantsFormOf(required, withFix(FIX.ANYOF_ONEOF_REQUIRED))).toBe("unknown");
    expect(variantsFormOf({ anyOf: [COMPONENT] }, withFix(FIX.ANYOF_ONEOF_REQUIRED))).toBe("union");
  });
});

describe("variantsMember", () => {
  it("variantsMember of an intersection whose variants miss the key is the base's", () => {
    const base = property(false);

    expect(variantsMember(base, [MISSING, MISSING], "intersection")).toBe(base);
  });

  it("variantsMember of an intersection with an optional joined member is optional", () => {
    const member = variantsMember(property(true), [property(true), MISSING], "intersection");

    expect(member).toMatchObject({ kind: "property", isOptional: true });
  });

  it("variantsMember of an intersection with a required variant member is opaque", () => {
    expect(variantsMember(property(false), [property(false)], "intersection")).toBe(OPAQUE);
  });

  it("variantsMember of a union is missing when one part misses the key", () => {
    expect(variantsMember(property(false), [MISSING], "union")).toBe(MISSING);
    expect(variantsMember(MISSING, [property(false)], "union")).toBe(MISSING);
    expect(variantsMember(property(false), [property(false)], "union")).toBe(OPAQUE);
  });

  it("variantsMember of an unknown form is opaque", () => {
    expect(variantsMember(property(false), [MISSING], "unknown")).toBe(OPAQUE);
  });
});

describe("intersectionMember", () => {
  it("intersectionMember of several optional properties is optional", () => {
    expect(intersectionMember([property(true), property(true)])).toMatchObject({
      isOptional: true,
    });
  });

  it("intersectionMember of an optional and a required property is opaque", () => {
    expect(intersectionMember([property(true), property(false)])).toBe(OPAQUE);
  });
});

describe("isMissingComposedKey", () => {
  const owner = (node: unknown) => ({ node, location: "#/components/schemas/Pet" });
  const OWN = { type: "object", properties: { owner: OBJECT } };

  it("isMissingComposedKey of a union whose variant misses the key is true", () => {
    expect(
      isMissingComposedKey(owner({ ...OWN, anyOf: [OBJECT] }), "owner", OPTIONS, NO_REFS),
    ).toBe(true);
  });

  it("isMissingComposedKey of an intersection, a plain object or unevaluatedProperties is false", () => {
    const fixed = withFix(FIX.UNEVALUATED_PROPERTIES);
    const unevaluated = { ...OWN, anyOf: [OBJECT], unevaluatedProperties: STRING };

    expect(
      isMissingComposedKey(owner({ ...OWN, oneOf: [OBJECT] }), "owner", OPTIONS, NO_REFS),
    ).toBe(false);
    expect(isMissingComposedKey(owner(OWN), "other", OPTIONS, NO_REFS)).toBe(false);
    expect(isMissingComposedKey(owner(unevaluated), "owner", fixed, NO_REFS)).toBe(false);
  });
});

describe("generatedMember of variants without a base", () => {
  const located = (node: unknown) => ({ node, location: "#/components/schemas/Pet" });

  it("generatedMember of a union alone whose every variant has the key is opaque", () => {
    const union = { anyOf: [OBJECT, OBJECT] };

    expect(generatedMember(located(union), "meow", OPTIONS, NO_REFS).kind).toBe("opaque");
    expect(generatedMember(located(union), "other", OPTIONS, NO_REFS).kind).toBe("missing");
  });
});
