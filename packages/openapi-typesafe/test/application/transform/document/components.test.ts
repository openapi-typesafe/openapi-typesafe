import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { componentsType } from "../../../../src/application/transform/document/components.js";
import { renameTakenAliases } from "../../../../src/application/transform/document/root-type-aliases.js";
import { irReference } from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration } from "../../../../src/domain/ir/nodes.js";
import {
  isEnumSchema,
  singularizeComponentKind,
} from "../../../../src/domain/openapi/components-object.js";
import { FIX } from "../../../../src/domain/output-fixes.js";
import { type FakeContextInput, fakeTransformContext } from "../../../fakes/transform-context.js";

/** `--root-types` with the `root-type-numbering` fix (ADR-021, roadmap R13). */
const NUMBERED = { rootTypes: true, fixes: new Set([FIX.ROOT_TYPE_NUMBERING]) };

function transform(components: unknown, input: FakeContextInput = {}) {
  const fake = fakeTransformContext(input);
  const { type, rootTypes } = componentsType(components as never, fake.context);
  const alias: IrDeclaration = {
    kind: "typeAlias",
    name: "T",
    isExported: false,
    type,
    comments: [],
  };
  return {
    text: printNodes([alias]),
    rootTypes: printNodes(rootTypes),
    namedRootTypes: printNodes(renameTakenAliases(rootTypes, [])),
    ...fake,
  };
}

describe("componentsType", () => {
  it("componentsType lists every kind; empty kinds are never", () => {
    const { text, diagnostics } = transform({ schemas: { Pet: { type: "string" } } });

    expect(text).toContain("schemas: {\n        Pet: string;\n    };");
    expect(text).toContain("pathItems: never;");
    expect(diagnostics.messages.map((entry) => entry.message)).toEqual([
      "Transformed components → schemas",
      "Transformed components → responses",
      "Transformed components → parameters",
      "Transformed components → requestBodies",
      "Transformed components → headers",
      "Transformed components → pathItems",
    ]);
  });

  it("componentsType lets the transform callback replace a component and make it optional", () => {
    const callbacks = { transform: () => ({ type: irReference("Custom"), isOptional: true }) };

    const { text } = transform(
      { schemas: { Pet: {} } },
      { callbacks, options: { immutable: true } },
    );

    expect(text).toContain("readonly Pet?: Custom;");
  });

  it("componentsType with --root-types numbers conflicting aliases", () => {
    const components = { schemas: { pet: {}, Pet: {} }, responses: { pet: {} } };

    const { rootTypes } = transform(components, { options: { rootTypes: true } });

    expect(rootTypes).toBe(
      "export type SchemaPet = components['schemas']['pet'];\n" +
        "export type SchemaPet_2 = components['schemas']['Pet'];\n" +
        "export type ResponsePet = components['responses']['pet'];\n",
    );
  });

  it("componentsType with --root-types options keeps casing and drops the schema prefix", () => {
    const options = { rootTypes: true, rootTypesKeepCasing: true, rootTypesNoSchemaPrefix: true };

    const { rootTypes } = transform({ schemas: { pet: {} } }, { options });

    expect(rootTypes).toBe("export type pet = components['schemas']['pet'];\n");
  });

  it("componentsType with --root-types-no-schema-prefix keeps the prefix before a digit (legacy bug 16)", () => {
    const options = { rootTypes: true, rootTypesNoSchemaPrefix: true };

    const { rootTypes } = transform({ schemas: { "1": {}, pet: {} } }, { options });

    expect(rootTypes).toBe(
      "export type Schema1 = components['schemas']['1'];\nexport type Pet = components['schemas']['pet'];\n",
    );
  });

  // As in the original: the later schema takes the shared name and the earlier one has no alias.
  // That output is valid, so numbering the earlier alias would change it (backlog 30).
  it("componentsType without the schema prefix gives the shared name to the later schema", () => {
    const options = { rootTypes: true, rootTypesNoSchemaPrefix: true };

    const { rootTypes } = transform({ schemas: { PetStore: {}, petStore: {} } }, { options });

    expect(rootTypes).toBe("export type PetStore = components['schemas']['petStore'];\n");
  });

  it("componentsType without the schema prefix never exports one name twice", () => {
    const options = { rootTypes: true, rootTypesNoSchemaPrefix: true };

    const { rootTypes } = transform({ schemas: { "1": {}, Schema1: {} } }, { options });

    expect(rootTypes).toBe("export type Schema1 = components['schemas']['Schema1'];\n");
  });

  it("componentsType without the schema prefix keeps it before a reserved name", () => {
    const options = { rootTypes: true, rootTypesKeepCasing: true, rootTypesNoSchemaPrefix: true };

    const { rootTypes } = transform({ schemas: { void: {}, class: {}, voids: {} } }, { options });

    expect(rootTypes).toBe(
      "export type Schemavoid = components['schemas']['void'];\n" +
        "export type Schemaclass = components['schemas']['class'];\n" +
        "export type voids = components['schemas']['voids'];\n",
    );
  });

  it("componentsType with the root-type-numbering fix numbers the earlier schemas of one name", () => {
    const options = { ...NUMBERED, rootTypesNoSchemaPrefix: true };

    const { rootTypes, namedRootTypes } = transform(
      { schemas: { Void: {}, void: {}, Pet: {} } },
      { options },
    );

    // The kept-aside alias follows the others under the shared name; the document names it last.
    expect(rootTypes).toBe(
      "export type Void = components['schemas']['void'];\n" +
        "export type Pet = components['schemas']['Pet'];\n" +
        "export type Void = components['schemas']['Void'];\n",
    );
    expect(namedRootTypes).toBe(
      "export type Void = components['schemas']['void'];\n" +
        "export type Pet = components['schemas']['Pet'];\n" +
        "export type Void_2 = components['schemas']['Void'];\n",
    );
  });

  it("componentsType with the root-type-numbering fix skips a number that an alias has", () => {
    const options = { ...NUMBERED, rootTypesNoSchemaPrefix: true, rootTypesKeepCasing: true };

    const { namedRootTypes } = transform(
      { schemas: { "a-b": {}, a_b: {}, a_b_2: {} } },
      { options },
    );

    expect(namedRootTypes).toBe(
      "export type a_b = components['schemas']['a_b'];\n" +
        "export type a_b_2 = components['schemas']['a_b_2'];\n" +
        "export type a_b_3 = components['schemas']['a-b'];\n",
    );
  });

  it("componentsType with the root-type-numbering fix and the prefix changes nothing", () => {
    const schemas = { schemas: { pet: {}, Pet: {} } };

    const fixed = transform(schemas, { options: NUMBERED }).rootTypes;

    expect(fixed).toBe(transform(schemas, { options: { rootTypes: true } }).rootTypes);
  });

  it("componentsType with --root-types-keep-casing writes invalid characters as _ (legacy bug 16)", () => {
    const options = { rootTypes: true, rootTypesKeepCasing: true };

    const { rootTypes } = transform({ schemas: { "my pet+x": {} } }, { options });

    expect(rootTypes).toBe("export type Schemamy_pet_x = components['schemas']['my pet+x'];\n");
  });

  it("componentsType with --root-types and --enum skips enum schemas", () => {
    const options = { rootTypes: true, enum: true };

    const { rootTypes } = transform({ schemas: { Status: { enum: ["a"] } } }, { options });

    expect(rootTypes).toBe("");
  });
});

describe("components domain rules", () => {
  it("singularizeComponentKind handles requestBodies and drops the s otherwise", () => {
    expect(singularizeComponentKind("requestBodies")).toBe("requestBody");
    expect(singularizeComponentKind("pathItems")).toBe("pathItem");
  });

  it("isEnumSchema is true only for non-object enums without properties", () => {
    expect(isEnumSchema({ enum: ["a"], type: "string" })).toBe(true);
    expect(isEnumSchema({ enum: ["a"], type: "object" })).toBe(false);
    expect(isEnumSchema({ enum: ["a"], additionalProperties: true })).toBe(false);
    expect(isEnumSchema([])).toBe(false);
    expect(isEnumSchema(null)).toBe(false);
  });
});
