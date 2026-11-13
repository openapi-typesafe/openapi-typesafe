import { describe, expect, it } from "vitest";
import {
  type GeneratedMember,
  intersectionMember,
  MISSING,
  NEVER_VALUES,
  OPAQUE,
  variantsMember,
} from "../../../src/application/transform/ref-pointer/generated-member.js";
import {
  generatedMember,
  isMissingComposedKey,
} from "../../../src/application/transform/ref-pointer/generated-shape.js";
import {
  type VariantsForm,
  variantsFormOf,
} from "../../../src/application/transform/ref-pointer/variants-form.js";
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
const formOf = (node: Record<string, unknown>, options: SchemaOptions = OPTIONS) =>
  variantsFormOf(node, { options, refs: NO_REFS }).kind;
const INTERSECTION: VariantsForm = { kind: "intersection" };
const UNION: VariantsForm = { kind: "union" };
const UNKNOWN: VariantsForm = { kind: "unknown" };

describe("variantsFormOf", () => {
  it("variantsFormOf of oneOf with a component or object variant is an intersection", () => {
    expect(formOf({ oneOf: [COMPONENT, STRING] })).toBe("intersection");
    expect(formOf({ oneOf: [OBJECT] })).toBe("intersection");
    expect(formOf({ oneOf: [{ type: "array" }] })).toBe("intersection");
  });

  it("variantsFormOf of oneOf of unknown or empty object variants is an intersection", () => {
    expect(formOf({ oneOf: [{ required: ["a"] }, { required: ["b"] }] })).toBe("intersection");
    expect(formOf({ oneOf: [{ type: "object", title: "A" }] })).toBe("intersection");
  });

  it("variantsFormOf of oneOf of primitives only is a union", () => {
    expect(formOf({ oneOf: [STRING, { type: "null" }] })).toBe("union");
  });

  it("variantsFormOf of oneOf it cannot read is unknown", () => {
    expect(formOf({ oneOf: [{ type: "string", enum: ["a"] }] })).toBe("unknown");
    expect(formOf({ oneOf: [{ $ref: "#/components/schemas/Cat/properties/a" }] })).toBe("unknown");
    expect(formOf({ oneOf: [{ enum: ["a"] }] })).toBe("unknown");
    expect(formOf({ oneOf: [{ const: "a" }] })).toBe("unknown");
    expect(formOf({ oneOf: [{ allOf: [STRING] }] })).toBe("unknown");
    expect(formOf({ oneOf: [{ type: "boolean", required: ["a"] }] })).toBe("unknown");
  });

  it("variantsFormOf with --binary-as-blob counts a formatted string as unknown", () => {
    const blob = { ...OPTIONS, binaryAsBlob: true };

    expect(formOf({ oneOf: [{ type: "string", format: "binary" }] }, blob)).toBe("unknown");
    expect(formOf({ oneOf: [STRING] }, blob)).toBe("union");
  });

  it("variantsFormOf of anyOf is a union, and an intersection with anyof-properties", () => {
    expect(formOf({ anyOf: [COMPONENT] })).toBe("union");
    expect(formOf({ anyOf: [COMPONENT] }, withFix(FIX.ANYOF_PROPERTIES))).toBe("intersection");
  });

  it("variantsFormOf of both keywords or a type list is unknown", () => {
    expect(formOf({ anyOf: [COMPONENT], oneOf: [COMPONENT] })).toBe("unknown");
    expect(formOf({ type: ["object", "string"], anyOf: [COMPONENT] })).toBe("unknown");
  });

  it("variantsFormOf with anyof-oneof-required gives the key lists of kept properties", () => {
    const fixed = withFix(FIX.ANYOF_ONEOF_REQUIRED);
    const node = { properties: { a: STRING, b: STRING }, oneOf: [{ required: ["a"] }] };

    expect(variantsFormOf(node, { options: fixed, refs: NO_REFS })).toEqual({
      kind: "required",
      keyLists: [["a"]],
    });
    expect(formOf({ ...node, type: "object", anyOf: node.oneOf, oneOf: [] }, fixed)).toBe(
      "required",
    );
    expect(formOf(node)).toBe("intersection");
  });

  it("variantsFormOf with anyof-oneof-required reads other variants as without it", () => {
    const fixed = withFix(FIX.ANYOF_ONEOF_REQUIRED);
    const deprecated = { ...OPTIONS, fixes: fixed.fixes, excludeDeprecated: true };
    const properties = { a: { ...STRING, deprecated: true } };

    expect(formOf({ properties, oneOf: [{ required: ["b"] }] }, fixed)).toBe("intersection");
    expect(formOf({ properties, oneOf: [{ required: ["a"] }] }, deprecated)).toBe("intersection");
    expect(formOf({ properties, oneOf: [{ required: ["a"] }] }, fixed)).toBe("required");
    expect(formOf({ type: "string", properties, oneOf: [{ required: ["a"] }] }, fixed)).toBe(
      "intersection",
    );
    expect(formOf({ anyOf: [COMPONENT] }, fixed)).toBe("union");
  });
});

describe("variantsMember", () => {
  it("variantsMember of an intersection whose variants miss the key is the base's", () => {
    const base = property(false);

    expect(variantsMember(base, [MISSING, MISSING], INTERSECTION, "k")).toBe(base);
  });

  it("variantsMember of an intersection with empty object variants is the base's", () => {
    const base = property(true);

    expect(variantsMember(base, [NEVER_VALUES, NEVER_VALUES], INTERSECTION, "k")).toBe(base);
  });

  it("variantsMember of an intersection with an optional joined member is optional", () => {
    const member = variantsMember(property(true), [property(true), MISSING], INTERSECTION, "k");

    expect(member).toMatchObject({ kind: "property", isOptional: true });
  });

  it("variantsMember of an intersection with a required variant member is opaque", () => {
    expect(variantsMember(property(false), [property(false)], INTERSECTION, "k")).toBe(OPAQUE);
  });

  it("variantsMember of a union is missing when one part misses the key", () => {
    expect(variantsMember(property(false), [MISSING], UNION, "k")).toBe(MISSING);
    expect(variantsMember(MISSING, [property(false)], UNION, "k")).toBe(MISSING);
    expect(variantsMember(property(false), [property(false)], UNION, "k")).toBe(OPAQUE);
  });

  it("variantsMember of an unknown form is opaque", () => {
    expect(variantsMember(property(false), [MISSING], UNKNOWN, "k")).toBe(OPAQUE);
  });

  it("variantsMember of required variants is required only where every variant requires it", () => {
    const form: VariantsForm = { kind: "required", keyLists: [["k", "a"], ["k"]] };
    const some: VariantsForm = { kind: "required", keyLists: [["k"], ["b"]] };

    expect(variantsMember(property(true), [], form, "k")).toMatchObject({ isOptional: false });
    expect(variantsMember(property(true), [], form, "a")).toMatchObject({ isOptional: true });
    expect(variantsMember(property(true), [], some, "k")).toMatchObject({ isOptional: true });
    expect(variantsMember(MISSING, [], form, "k")).toBe(MISSING);
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

  it("intersectionMember of a property and other parts' index signatures is the property", () => {
    const base = property(true);
    const index: GeneratedMember = {
      kind: "index",
      node: {},
      location: undefined,
      isOtherType: false,
    };

    expect(intersectionMember([base, NEVER_VALUES])).toBe(base);
    expect(intersectionMember([index, base])).toBe(base);
    expect(intersectionMember([NEVER_VALUES, MISSING])).toBe(NEVER_VALUES);
    expect(intersectionMember([NEVER_VALUES, index])).toBe(OPAQUE);
  });

  it("intersectionMember of $defs and another part's index signature is the $defs", () => {
    const names: GeneratedMember = { kind: "names", names: {}, location: undefined };

    expect(intersectionMember([names, NEVER_VALUES])).toBe(names);
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

describe("generatedMember of variants", () => {
  const located = (node: unknown) => ({ node, location: "#/components/schemas/Pet" });

  it("generatedMember of a union alone whose every variant has the key is opaque", () => {
    const union = { anyOf: [OBJECT, OBJECT] };

    expect(generatedMember(located(union), "meow", OPTIONS, NO_REFS).kind).toBe("opaque");
    expect(generatedMember(located(union), "other", OPTIONS, NO_REFS).kind).toBe("missing");
  });

  it("generatedMember of an empty object is never, or missing with --empty-objects-unknown", () => {
    const empty = { type: "object", title: "A" };
    const unknownObjects = { ...OPTIONS, emptyObjectsUnknown: true };

    expect(generatedMember(located(empty), "a", OPTIONS, NO_REFS).kind).toBe("never");
    expect(generatedMember(located(empty), "a", unknownObjects, NO_REFS).kind).toBe("missing");
  });

  it("generatedMember next to required-only variants is the optional own property", () => {
    const node = { ...OBJECT, oneOf: [{ required: ["meow"] }, { type: "object" }] };
    const fixed = withFix(FIX.ANYOF_ONEOF_REQUIRED);
    const required = { ...OBJECT, anyOf: [{ required: ["meow"] }] };

    expect(generatedMember(located(node), "meow", OPTIONS, NO_REFS)).toMatchObject({
      isOptional: true,
    });
    expect(generatedMember(located(required), "meow", fixed, NO_REFS)).toMatchObject({
      isOptional: false,
    });
  });
});
