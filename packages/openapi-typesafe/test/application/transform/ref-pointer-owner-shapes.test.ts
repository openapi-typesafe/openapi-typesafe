import { describe, expect, it } from "vitest";
import { generatedMember } from "../../../src/application/transform/ref-pointer/generated-shape.js";
import { originalIndexFails } from "../../../src/application/transform/ref-pointer/original-index.js";
import { refPointerOf } from "../../../src/application/transform/ref-pointer/pointer-walk.js";
import type {
  RefResolver,
  SchemaOptions,
} from "../../../src/application/transform/schema/schema-context.js";
import { parseRefPointer } from "../../../src/domain/openapi/json-pointer.js";
import { FIX } from "../../../src/domain/output-fixes.js";
import { DEFAULT_TRANSFORM_OPTIONS } from "../../fakes/transform-context.js";

/** The `$ref` pointer walk through discriminator owners and `unevaluatedProperties` (ADR-026). */

const STRING = { type: "string" };
const ENTRY = { type: "object", properties: { count: { type: "integer" } } };
const OLD = { type: "string", deprecated: true };
const SCHEMAS = {
  Pet: {
    type: "object",
    properties: { kind: STRING, owner: ENTRY },
    discriminator: { propertyName: "kind" },
  },
  Stats: { type: "object", properties: { total: STRING }, unevaluatedProperties: STRING },
  Only: { type: "object", unevaluatedProperties: STRING },
  Open: { type: "object", unevaluatedProperties: true },
  Closed: { type: "object", properties: { total: STRING }, unevaluatedProperties: false },
  ClosedOnly: { type: "object", unevaluatedProperties: false },
  Named: {
    type: "object",
    properties: { unevaluatedProperties: STRING },
    unevaluatedProperties: STRING,
  },
  Composed: { allOf: [ENTRY], unevaluatedProperties: STRING },
  Beside: { type: "object", additionalProperties: ENTRY, unevaluatedProperties: STRING },
  OldOnly: { type: "object", properties: { old: OLD }, unevaluatedProperties: STRING },
};
const DOCUMENT = { components: { schemas: SCHEMAS } };
const OPTIONS: SchemaOptions = DEFAULT_TRANSFORM_OPTIONS;
const FIXED: SchemaOptions = { ...OPTIONS, fixes: new Set([FIX.UNEVALUATED_PROPERTIES]) };
const FIXED_EXCLUDING: SchemaOptions = { ...FIXED, excludeDeprecated: true };

const REFS: RefResolver = {
  resolve: (ref) =>
    parseRefPointer(ref).reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null ? (node as never)[segment] : undefined,
      DOCUMENT,
    ),
};

function member(name: keyof typeof SCHEMAS, key: string, options = OPTIONS) {
  const location = `#/components/schemas/${name}`;
  return generatedMember({ node: SCHEMAS[name], location }, key, options, REFS);
}

function fails(ref: string, options = OPTIONS): boolean {
  const pointer = refPointerOf(`#/components/schemas/${ref}`);
  if (pointer === null) {
    throw new Error(`no pointer in ${ref}`);
  }
  return originalIndexFails({ pointer, options, refs: REFS });
}

describe("generatedMember of a discriminator owner", () => {
  it("generatedMember reads a property other than the discriminator's as written", () => {
    expect(member("Pet", "owner")).toMatchObject({ kind: "property", isOptional: true });
    expect(member("Pet", "kind").kind).toBe("opaque");
  });

  it("originalIndexFails past an optional property of a discriminator owner is true", () => {
    expect(fails("Pet/properties/owner/properties/count")).toBe(true);
    expect(fails("Pet/properties/owner")).toBe(false);
  });
});

describe("generatedMember of unevaluatedProperties", () => {
  it("generatedMember without the fix reads the keyword as missing from the type", () => {
    expect(member("Stats", "unevaluatedProperties").kind).toBe("missing");
    expect(member("Only", "unevaluatedProperties").kind).toBe("missing");
    expect(member("Only", "other").kind).toBe("never");
    expect(member("ClosedOnly", "unevaluatedProperties").kind).toBe("never");
    expect(member("Named", "unevaluatedProperties").kind).toBe("property");
  });

  it("generatedMember with the fix reads the index signature, wider next to properties", () => {
    expect(member("Stats", "unevaluatedProperties", FIXED)).toEqual({
      kind: "index",
      node: STRING,
      location: "#/components/schemas/Stats/unevaluatedProperties",
      isOtherType: true,
    });
    expect(member("Only", "unevaluatedProperties", FIXED)).toMatchObject({ isOtherType: false });
    expect(member("Composed", "other", FIXED)).toMatchObject({ kind: "index", isOtherType: true });
    expect(member("Open", "other", FIXED)).toMatchObject({ kind: "index", node: undefined });
  });

  it("generatedMember with the fix reads a declared property alone", () => {
    expect(member("Stats", "total", FIXED)).toMatchObject({ kind: "property", node: STRING });
    expect(member("Composed", "count", FIXED)).toMatchObject({ kind: "property" });
  });

  it("generatedMember with the fix ignores the keyword where it does not apply", () => {
    expect(member("Closed", "unevaluatedProperties", FIXED).kind).toBe("missing");
    expect(member("Beside", "unevaluatedProperties", FIXED).kind).toBe("missing");
    expect(member("Beside", "other", FIXED)).toMatchObject({ kind: "index", node: ENTRY });
  });

  it("generatedMember with the fix reads a left-out property's key as another type", () => {
    expect(member("OldOnly", "old", FIXED_EXCLUDING)).toMatchObject({ isOtherType: true });
    expect(member("OldOnly", "other", FIXED_EXCLUDING)).toMatchObject({ isOtherType: false });
  });

  it("originalIndexFails of unevaluatedProperties is true unless the signature is its type", () => {
    expect(fails("Stats/unevaluatedProperties")).toBe(true);
    expect(fails("Stats/unevaluatedProperties", FIXED)).toBe(true);
    expect(fails("Only/unevaluatedProperties")).toBe(true);
    expect(fails("Only/unevaluatedProperties", FIXED)).toBe(false);
  });
});
