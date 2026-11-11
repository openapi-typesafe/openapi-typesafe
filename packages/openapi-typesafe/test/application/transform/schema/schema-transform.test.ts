import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { InvalidRefError } from "../../../../src/application/transform/ref-type.js";
import { InvalidPropertyError } from "../../../../src/application/transform/schema/object-type.js";
import {
  InvalidSchemaError,
  transformSchema,
  transformSchemaShape,
} from "../../../../src/application/transform/schema/schema-transform.js";
import { irReference } from "../../../../src/domain/ir/constructors.js";
import type { IrType } from "../../../../src/domain/ir/nodes.js";
import {
  type FakeCallbacks,
  type FakeContextInput,
  fakeTransformContext,
} from "../../../fakes/transform-context.js";

const ROOT = { path: "#/components/schemas/Root" };

function print(type: IrType): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type }]).slice("type T = ".length, -2);
}

function transform(schema: unknown, input: FakeContextInput = {}, path = ROOT.path) {
  const { context, footer } = fakeTransformContext(input);
  const type = transformSchema(schema as never, { path }, context);
  return { text: print(type), footer };
}

describe("transformSchema", () => {
  it("transformSchema with primitive types prints keywords", () => {
    expect(transform({ type: "string" }).text).toBe("string");
    expect(transform({ type: "integer" }).text).toBe("number");
    expect(transform({ type: ["string", "null"] }).text).toBe("string | null");
  });

  it("transformSchema with a $ref that has no pointer throws InvalidRefError", () => {
    expect(() => transform({ $ref: "other.yaml" })).toThrow(InvalidRefError);
  });

  // The Redocly loader rejects such a cycle; the guard keeps any other loader from recursing.
  it("transformSchema with a $ref into a cycle of $refs stops where the cycle closes", () => {
    const defs = "#/components/schemas/Pair/definitions";
    const definitions = { Left: { $ref: `${defs}/Right` }, Right: { $ref: `${defs}/Left` } };
    const pair = { type: "object", properties: { id: { type: "string" } }, definitions };
    const documents = { "#/components": { schemas: { Pair: pair } } };

    const { text } = transform({ $ref: `${defs}/Left` }, { documents });

    expect(text).toBe('components["schemas"]["Pair"]["definitions"]["Right"]');
  });

  it("transformSchema with a boolean schema prints unknown or never", () => {
    expect(transform(true).text).toBe("unknown");
    expect(transform(false).text).toBe("never");
  });

  it("transformSchema with a missing schema prints never", () => {
    expect(transform(null).text).toBe("never");
  });

  it("transformSchema with a non-object schema throws InvalidSchemaError", () => {
    expect(() => transform("string")).toThrow(InvalidSchemaError);
    expect(() => transform([])).toThrow("Expected SchemaObject, received Array at #/components");
  });

  it("transformSchema with a $ref prints an indexed access on components", () => {
    expect(transform({ $ref: "#/components/schemas/Pet" }).text).toBe(
      'components["schemas"]["Pet"]',
    );
  });

  it("transformSchema with required and optional properties marks optional ones", () => {
    const schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" } },
    };

    expect(transform(schema).text).toBe("{\n    id: string;\n    name?: string;\n}");
  });

  it("transformSchema with an invalid property throws InvalidPropertyError", () => {
    const schema = { type: "object", properties: { id: "string" } };

    expect(() => transform(schema)).toThrow(InvalidPropertyError);
    expect(() => transform(schema)).toThrow(
      "#/components/schemas/Root: invalid property id. Expected Schema Object or boolean, " +
        "got string",
    );
  });

  it("transformSchema with an array property reports Array as the received kind", () => {
    const schema = { type: "object", properties: { id: [] } };

    expect(() => transform(schema)).toThrow("got Array");
  });

  it("transformSchema with --exclude-deprecated drops deprecated properties and refs", () => {
    const schema = {
      type: "object",
      properties: {
        old: { type: "string", deprecated: true },
        ref: { $ref: "#/components/schemas/Old" },
        kept: { type: "string" },
      },
    };
    const documents = { "#/components/schemas/Old": { deprecated: true } };

    const { text } = transform(schema, { options: { excludeDeprecated: true }, documents });

    expect(text).toBe("{\n    kept?: string;\n}");
  });

  it("transformSchema with --read-write-markers wraps one-way properties", () => {
    const schema = {
      type: "object",
      properties: { r: { type: "string", readOnly: true }, w: { type: "string", writeOnly: true } },
    };

    const { text } = transform(schema, { options: { readWriteMarkers: true } });

    expect(text).toBe("{\n    r?: $Read<string>;\n    w?: $Write<string>;\n}");
  });

  it("transformSchema with --enum declares the enum in the footer", () => {
    const { text, footer } = transform(
      { type: "string", enum: ["a", "b"] },
      {
        options: { enum: true },
      },
    );

    expect(text).toBe("Root");
    expect(footer.enums).toEqual([
      {
        name: "/Root",
        isComponentSchema: true,
        values: ["a", "b"],
        metadata: [
          { name: undefined, description: undefined },
          { name: undefined, description: undefined },
        ],
      },
    ]);
  });

  it("transformSchema with --enum and a null member keeps a literal union", () => {
    const { text, footer } = transform({ enum: ["a", null] }, { options: { enum: true } });

    expect(text).toBe('"a" | null');
    expect(footer.enums).toEqual([]);
  });

  it("transformSchema with --enum-values in a union drops variant positions from the ref", () => {
    const path = "#/components/schemas/Root/properties/a/anyOf/0/properties/b";

    const { footer } = transform({ enum: ["x"] }, { options: { enumValues: true } }, path);

    expect(footer.enumValues).toHaveLength(1);
    expect(footer.enumValues[0]?.name).toBe("/Root/properties/a/anyOf/0/properties/bValues");
    expect(print(footer.enumValues[0]?.type as IrType)).toBe(
      'Extract<FlattenedDeepRequired<components>["schemas"]["Root"]["a"], {\n' +
        '    b: unknown;\n}>["b"]',
    );
  });

  it("transformSchema with --enum-values types a record value next to properties by its values", () => {
    const stats = {
      type: "object",
      properties: { total: { type: "integer" } },
      additionalProperties: { type: "string", enum: ["x", "y"] },
    };

    const { footer } = transform(stats, { options: { enumValues: true } });

    expect(print(footer.enumValues[0]?.type as IrType)).toBe('"x" | "y"');
  });

  it("transformSchema with additionalProperties: true on a string enum keeps other strings", () => {
    const { text } = transform({ type: "string", enum: ["a"], additionalProperties: true });

    expect(text).toBe('"a" | (string & {})');
  });

  it("transformSchema applies postTransform and transformSchemaShape skips it", () => {
    const callbacks = { postTransform: () => irReference("Custom") };
    const { context } = fakeTransformContext({ callbacks });

    expect(print(transformSchema({ type: "string" }, ROOT, context))).toBe("Custom");
    expect(print(transformSchemaShape({ type: "string" }, ROOT, context))).toBe("string");
  });

  it("transformSchema with a transform callback overrides a property type and optionality", () => {
    const callbacks = {
      transform: (schema: unknown) =>
        (schema as { format?: string }).format === "date-time"
          ? { type: irReference("Date"), isOptional: true }
          : null,
    };
    const schema = {
      type: "object",
      required: ["at"],
      properties: { at: { type: "string", format: "date-time" } },
    };

    const { text } = transform(schema, { callbacks });

    expect(text).toBe("{\n    /** Format: date-time */\n    at?: Date;\n}");
  });

  it("transformSchema with transformProperty puts the callback comment first", () => {
    const callbacks: FakeCallbacks = {
      transformProperty: (property) => ({
        ...property,
        comments: [{ kind: "block", text: "* @custom " }],
      }),
    };
    const schema = { type: "object", properties: { a: { type: "string", description: "Text" } } };

    const { text } = transform(schema, { callbacks });

    expect(text).toBe("{\n    /** @custom */\n    /** @description Text */\n    a?: string;\n}");
  });

  it("transformSchema with a parent discriminator adds the discriminator property", () => {
    const discriminators = {
      [ROOT.path]: { propertyName: "kind", mapping: { root: ROOT.path } },
    };
    const schema = { allOf: [{ type: "object", properties: { a: { type: "string" } } }] };

    const { text } = transform(schema, { discriminators });

    expect(text).toContain('kind: "root";');
  });

  it("transformSchema with a handled discriminator ref does not add it again", () => {
    const discriminators = { [ROOT.path]: { propertyName: "kind" } };
    const schema = { allOf: [{ type: "object" }] };

    const { text } = transform(schema, { discriminators, handledRefs: [ROOT.path] });

    expect(text).not.toContain("kind");
  });

  it("transformSchema with a parent discriminator and no own properties adds the property", () => {
    const discriminators = { [ROOT.path]: { propertyName: "kind", mapping: { root: ROOT.path } } };
    const schema = { allOf: [{ type: "object" }], additionalProperties: true };

    const { text } = transform(schema, { discriminators });

    expect(text).toContain('kind: "root";');
  });

  it("transformSchema without a path adds no inherited discriminator", () => {
    const { context } = fakeTransformContext({ discriminators: { "": { propertyName: "kind" } } });
    const schema = { allOf: [{ type: "object" }], properties: { a: { type: "string" } } };

    const text = print(transformSchema(schema as never, {}, context));

    expect(text).not.toContain("kind");
  });

  it("transformSchema without a path omits only the discriminator of an allOf item", () => {
    const { context } = fakeTransformContext();
    const item = {
      discriminator: { propertyName: "kind" },
      properties: { kind: { type: "string" } },
    };

    const text = print(transformSchema({ allOf: [item] } as never, {}, context));

    expect(text).toBe('Omit<{\n    kind?: string;\n}, "kind">');
  });

  it("transformSchema with $defs nests them under an optional $defs member", () => {
    const schema = { type: "object", $defs: { a: { type: "string" } } };

    expect(transform(schema).text).toBe("{\n    $defs?: {\n        a: string;\n    };\n}");
  });

  it("transformSchema with additionalProperties adds an index signature", () => {
    const schema = { type: "object", additionalProperties: { type: "number" } };

    expect(transform(schema).text).toBe("{\n    [key: string]: number;\n}");
  });

  it("transformSchema with an empty object and --empty-objects-unknown prints a record", () => {
    const { text } = transform({ type: "object" }, { options: { emptyObjectsUnknown: true } });

    expect(text).toBe("Record<string, unknown>");
  });

  it("transformSchema with a required key the allOf ref defines uses WithRequired", () => {
    const schema = {
      allOf: [{ $ref: "#/components/schemas/A" }],
      required: ["b"],
    };
    const documents = {
      "#/components/schemas/A": { type: "object", properties: { b: { type: "string" } } },
    };

    const { text, footer } = transform(schema, { documents });

    expect(text).toBe('WithRequired<components["schemas"]["A"], "b">');
    expect(footer.withRequiredCount).toBe(1);
  });

  it("transformSchema with nullable: true adds null", () => {
    expect(transform({ type: "string", nullable: true }).text).toBe("string | null");
  });
});
