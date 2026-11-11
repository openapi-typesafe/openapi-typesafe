import { describe, expect, it } from "vitest";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { generatedMember } from "../../../src/application/transform/ref-pointer/generated-shape.js";
import { originalIndexFails } from "../../../src/application/transform/ref-pointer/original-index.js";
import { refPointerOf } from "../../../src/application/transform/ref-pointer/pointer-walk.js";
import { typedWalk } from "../../../src/application/transform/ref-pointer/typed-walk.js";
import type {
  RefResolver,
  SchemaOptions,
} from "../../../src/application/transform/schema/schema-context.js";
import { parseRefPointer } from "../../../src/domain/openapi/json-pointer.js";
import { DEFAULT_TRANSFORM_OPTIONS } from "../../fakes/transform-context.js";

/** The `$ref` pointer walks through index signatures (ADR-026). */

const ENTRY = { type: "object", properties: { count: { type: "integer" } } };
const OLD = { type: "string", deprecated: true };
const SCHEMAS = {
  Map: { type: "object", additionalProperties: ENTRY },
  Stats: {
    type: "object",
    properties: { total: { type: "integer" } },
    additionalProperties: ENTRY,
  },
  OldOnly: { type: "object", properties: { old: OLD }, additionalProperties: ENTRY },
  Uses: { type: "object", properties: { old: OLD }, additionalProperties: { type: "integer" } },
  OpenUses: { type: "object", properties: { old: OLD }, additionalProperties: true },
  Pattern: { type: "object", patternProperties: { "^x": ENTRY } },
  Patterns: { type: "object", patternProperties: { "^x": ENTRY, "^y": ENTRY } },
  OpenPattern: { type: "object", patternProperties: { "^x": {} }, additionalProperties: ENTRY },
  Both: { type: "object", patternProperties: { "^x": ENTRY }, additionalProperties: ENTRY },
  Composed: { allOf: [ENTRY], additionalProperties: ENTRY },
  Chosen: { oneOf: [ENTRY], additionalProperties: ENTRY },
  Tagged: {
    type: "object",
    properties: { kind: { type: "string" }, old: OLD },
    discriminator: { propertyName: "kind" },
    additionalProperties: { type: "integer" },
  },
  TaggedMap: {
    type: "object",
    discriminator: { propertyName: "kind" },
    additionalProperties: { type: "integer" },
  },
  NoDefs: { type: "object", $defs: {} },
  Defs: {
    type: "object",
    $defs: {
      Inner: { type: "object", properties: { z: { type: "string" } }, additionalProperties: ENTRY },
      Plain: { type: "object", additionalProperties: ENTRY },
      Marked: { type: "object", readOnly: true, properties: { z: { type: "string" } } },
    },
  },
};
const DOCUMENT = { components: { schemas: SCHEMAS } };
const OPTIONS: SchemaOptions = DEFAULT_TRANSFORM_OPTIONS;
const EXCLUDING: SchemaOptions = { ...OPTIONS, excludeDeprecated: true };

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

function pointer(ref: string) {
  const result = refPointerOf(ref);
  if (result === null) {
    throw new Error(`no pointer in ${ref}`);
  }
  return result;
}

function fails(ref: string, options = OPTIONS): boolean {
  return originalIndexFails({
    pointer: pointer(`#/components/schemas/${ref}`),
    options,
    refs: REFS,
  });
}

function walked(ref: string, options = OPTIONS): string {
  const result = typedWalk({
    pointer: pointer(`#/components/schemas/${ref}`),
    options,
    refs: REFS,
  });
  if (result.kind === "untyped") {
    return `untyped at ${result.index}`;
  }
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: result.walk.type }]).slice("type T = ".length, -2);
}

describe("generatedMember of an index signature", () => {
  it("generatedMember reads additionalProperties alone as its own type", () => {
    expect(member("Map", "additionalProperties")).toEqual({
      kind: "index",
      node: ENTRY,
      location: "#/components/schemas/Map/additionalProperties",
      isOtherType: false,
    });
  });

  it("generatedMember next to kept properties reads another type", () => {
    expect(member("Stats", "additionalProperties")).toMatchObject({ isOtherType: true });
    expect(member("OldOnly", "additionalProperties", EXCLUDING)).toMatchObject({
      isOtherType: false,
    });
  });

  it("generatedMember of a left-out property reads the index signature's type, not its own", () => {
    expect(member("Uses", "old", EXCLUDING)).toMatchObject({ kind: "index", isOtherType: true });
    expect(member("OpenUses", "old", EXCLUDING)).toEqual({
      kind: "index",
      node: undefined,
      location: undefined,
      isOtherType: true,
    });
    expect(member("OpenUses", "other", EXCLUDING)).toMatchObject({ isOtherType: false });
  });

  it("generatedMember reads one pattern as its schema and several as another type", () => {
    expect(member("Pattern", "patternProperties")).toEqual({
      kind: "index",
      node: ENTRY,
      location: "#/components/schemas/Pattern/patternProperties/^x",
      isOtherType: false,
    });
    expect(member("Patterns", "patternProperties")).toMatchObject({ isOtherType: true });
    expect(member("Both", "additionalProperties")).toMatchObject({ isOtherType: true });
    expect(member("OpenPattern", "additionalProperties")).toMatchObject({ node: undefined });
  });

  it("generatedMember of a discriminator owner reads other keys through the signature", () => {
    expect(member("Tagged", "additionalProperties")).toMatchObject({ isOtherType: true });
    expect(member("Tagged", "kind").kind).toBe("opaque");
    expect(member("TaggedMap", "additionalProperties")).toMatchObject({ isOtherType: false });
    expect(member("TaggedMap", "kind").kind).toBe("opaque");
  });

  it("generatedMember reads $defs as its map of definitions", () => {
    expect(member("Defs", "$defs")).toEqual({
      kind: "names",
      names: SCHEMAS.Defs.$defs,
      location: "#/components/schemas/Defs/$defs",
    });
    expect(member("Map", "$defs").kind).not.toBe("names");
    expect(member("Defs", "other").kind).toBe("missing");
    expect(member("NoDefs", "$defs").kind).not.toBe("names");
  });
});

describe("originalIndexFails through an index signature", () => {
  it("originalIndexFails through an index signature of another type is true", () => {
    expect(fails("Stats/additionalProperties")).toBe(true);
    expect(fails("Uses/properties/old", EXCLUDING)).toBe(true);
    expect(fails("Pattern/patternProperties/^x")).toBe(true);
  });

  it("originalIndexFails through an index signature of the target's type is false", () => {
    expect(fails("Map/additionalProperties")).toBe(false);
    expect(fails("Pattern/patternProperties")).toBe(false);
    expect(fails("Uses/properties/old")).toBe(false);
  });

  it("originalIndexFails through a signature of several value schemas is true", () => {
    expect(fails("Both/additionalProperties")).toBe(true);
    expect(fails("Both/patternProperties/^x")).toBe(true);
    expect(fails("Patterns/patternProperties/^x")).toBe(true);
  });

  it("originalIndexFails through a discriminator owner's signature is true", () => {
    expect(fails("Tagged/additionalProperties")).toBe(true);
    expect(fails("Tagged/properties/old", EXCLUDING)).toBe(true);
    expect(fails("TaggedMap/additionalProperties")).toBe(false);
  });

  it("originalIndexFails reads the definitions of $defs", () => {
    expect(fails("Defs/$defs/Inner/additionalProperties")).toBe(true);
    expect(fails("Defs/$defs/Plain/additionalProperties")).toBe(false);
    expect(fails("Defs/$defs")).toBe(false);
    expect(fails("Defs/$defs/Missing/additionalProperties")).toBe(true);
  });

  it("originalIndexFails past a marked definition is true with --read-write-markers", () => {
    const markers = { ...OPTIONS, readWriteMarkers: true };

    expect(fails("Defs/$defs/Marked/properties/z", markers)).toBe(true);
    expect(fails("Defs/$defs/Marked", markers)).toBe(false);
    expect(fails("Defs/$defs/Marked/properties/z")).toBe(false);
  });
});

describe("typedWalk of additionalProperties", () => {
  it("typedWalk indexes additionalProperties alone by string", () => {
    expect(walked("Map/additionalProperties")).toBe('components["schemas"]["Map"][string]');
    expect(walked("OldOnly/additionalProperties", EXCLUDING)).toBe(
      'components["schemas"]["OldOnly"][string]',
    );
    // A node that is not in the document is indexed as the keyword says.
    expect(walked("Missing/additionalProperties")).toBe('components["schemas"]["Missing"][string]');
  });

  it("typedWalk stops where the index signature holds other types", () => {
    expect(walked("Stats/additionalProperties")).toBe("untyped at 2");
    expect(walked("Both/additionalProperties")).toBe("untyped at 2");
    expect(walked("Composed/additionalProperties")).toBe("untyped at 2");
    expect(walked("Chosen/additionalProperties")).toBe("untyped at 2");
  });
});
