import { describe, expect, it } from "vitest";
import {
  declaredTypeLookup,
  NO_DECLARED_TYPES,
} from "../../src/application/transform/document/declared-types.js";
import {
  irIndexedAccess,
  irKeyword,
  irNumber,
  irObject,
  irProperty,
  irReference,
  irString,
} from "../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrMember, IrType } from "../../src/domain/ir/nodes.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";

/** The declared types that references of the generated file name (upstream #1752). */

const STRING = irKeyword("string");

const indexed = (name: string, ...keys: string[]): IrType =>
  keys.reduce<IrType>(
    (object, key) => irIndexedAccess(object, irString(key, "escaped")),
    irReference(name),
  );
const required = (name: string, type: IrType) => irProperty(toPropertyName(name), type);
const interfaceOf = (name: string, ...members: IrMember[]): IrDeclaration => ({
  kind: "interface",
  name,
  isExported: true,
  members,
  comments: [],
});

const PET = irObject([required("id", STRING)]);
const COMPONENTS = interfaceOf("components", required("schemas", irObject([required("Pet", PET)])));

describe("declaredTypeLookup", () => {
  it("declaredTypeLookup reads a property of an interface by its keys", () => {
    const lookup = declaredTypeLookup([COMPONENTS]);

    expect(lookup(indexed("components", "schemas", "Pet"))).toBe(PET);
  });

  it("declaredTypeLookup reads a type alias", () => {
    const alias: IrDeclaration = {
      kind: "typeAlias",
      name: "paths",
      isExported: true,
      type: irObject([required("/pets", PET)]),
      comments: [],
    };

    expect(declaredTypeLookup([alias])(indexed("paths", "/pets"))).toBe(PET);
  });

  it("declaredTypeLookup follows a key through a property that is a reference again", () => {
    const paths = interfaceOf("paths", required("/pets", indexed("components", "schemas")));

    expect(declaredTypeLookup([COMPONENTS, paths])(indexed("paths", "/pets", "Pet"))).toBe(PET);
  });

  it("declaredTypeLookup does not name an optional property, a missing one or a bare name", () => {
    const optional = irProperty(toPropertyName("Pet"), PET, { isOptional: true });
    const lookup = declaredTypeLookup([interfaceOf("components", optional)]);

    expect(lookup(indexed("components", "Pet"))).toBeNull();
    expect(lookup(indexed("components", "Other"))).toBeNull();
    expect(lookup(irReference("components"))).toBeNull();
  });

  it("declaredTypeLookup does not name an interface declared twice, which merges", () => {
    const lookup = declaredTypeLookup([COMPONENTS, interfaceOf("components")]);

    expect(lookup(indexed("components", "schemas", "Pet"))).toBeNull();
  });

  it("declaredTypeLookup does not read types it cannot index", () => {
    const enumDeclaration: IrDeclaration = {
      kind: "enum",
      name: "Color",
      isExported: true,
      members: [],
      comments: [],
    };
    const lookup = declaredTypeLookup([COMPONENTS, enumDeclaration]);

    expect(lookup(irIndexedAccess(irReference("components"), irNumber(0)))).toBeNull();
    expect(
      lookup(irIndexedAccess(irReference("Pick", [PET]), irString("id", "escaped"))),
    ).toBeNull();
    expect(lookup(indexed("Color", "Red"))).toBeNull();
    expect(lookup(STRING)).toBeNull();
  });

  it("declaredTypeLookup does not index a type alias that is no object, nor read nameless text", () => {
    const alias: IrDeclaration = {
      kind: "typeAlias",
      name: "Id",
      isExported: true,
      type: STRING,
      comments: [],
    };
    const text: IrDeclaration = { kind: "rawDeclaration", text: "declare const x: 1;" };

    const lookup = declaredTypeLookup([alias, text]);

    expect(lookup(indexed("Id", "length"))).toBeNull();
  });

  it("declaredTypeLookup with a reference that indexes into itself names nothing", () => {
    const loop = indexed("components", "schemas", "Loop", "next");
    const components = interfaceOf(
      "components",
      required("schemas", irObject([required("Loop", loop)])),
    );

    expect(declaredTypeLookup([components])(loop)).toBeNull();
  });

  it("NO_DECLARED_TYPES names nothing", () => {
    expect(NO_DECLARED_TYPES(indexed("components", "schemas", "Pet"))).toBeNull();
  });
});
