import { describe, expect, it } from "vitest";
import {
  renameTakenAliases,
  rootTypeAlias,
} from "../../../../src/application/transform/document/root-type-aliases.js";
import { irReference } from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration } from "../../../../src/domain/ir/nodes.js";

function enumDeclaration(name: string): IrDeclaration {
  return { kind: "enum", name, isExported: true, members: [], comments: [] } as never;
}

function names(declarations: readonly IrDeclaration[]): string[] {
  return declarations.map((declaration) => (declaration as { name: string }).name);
}

describe("renameTakenAliases", () => {
  it("renameTakenAliases with a colliding alias adds the suffix _2", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];

    const renamed = renameTakenAliases(body, [enumDeclaration("Pet")]);

    expect(names(renamed)).toEqual(["Pet_2"]);
  });

  it("renameTakenAliases skips suffixes that are already taken", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet"), rootTypeAlias("Pet_2", "schemas", "X")];

    const renamed = renameTakenAliases(body, [enumDeclaration("Pet")]);

    expect(names(renamed)).toEqual(["Pet_3", "Pet_2"]);
  });

  it("renameTakenAliases keeps aliases that are not root type aliases", () => {
    const alias: IrDeclaration = {
      kind: "typeAlias",
      name: "Pet",
      isExported: true,
      type: irReference("Other"),
      comments: [],
    };

    const renamed = renameTakenAliases([alias], [enumDeclaration("Pet")]);

    expect(renamed).toEqual([alias]);
  });

  it("renameTakenAliases renames an alias that a helper type takes", () => {
    const body = [rootTypeAlias("WithRequired", "schemas", "WithRequired")];
    const helper: IrDeclaration = {
      kind: "rawDeclaration",
      name: "WithRequired",
      text: "type WithRequired<T> = T;",
    };

    expect(names(renameTakenAliases(body, [helper]))).toEqual(["WithRequired_2"]);
  });

  it("renameTakenAliases renames an alias that raw code declares and ignores values", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet"), rootTypeAlias("Tag", "schemas", "Tag")];
    const injected: IrDeclaration = { kind: "rawDeclaration", text: "export type Pet = string;" };
    const values = {
      kind: "constArray",
      name: "Tag",
      isExported: true,
      values: [],
      comments: [],
    } as never;

    expect(names(renameTakenAliases(body, [injected, values]))).toEqual(["Pet_2", "Tag"]);
  });

  it("renameTakenAliases renames an alias that a closing declaration takes", () => {
    const body = [rootTypeAlias("ApiPaths", "schemas", "ApiPaths")];

    const renamed = renameTakenAliases(body, [], [enumDeclaration("ApiPaths")]);

    expect(names(renamed)).toEqual(["ApiPaths_2"]);
  });

  it("renameTakenAliases renames an alias that a root interface of the body takes", () => {
    const root: IrDeclaration = {
      kind: "interface",
      name: "paths",
      isExported: true,
      members: [],
      comments: [],
    };
    const body = [root, rootTypeAlias("paths", "schemas", "paths")];

    expect(names(renameTakenAliases(body, []))).toEqual(["paths", "paths_2"]);
  });

  it("renameTakenAliases with an empty footer returns the body unchanged", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];

    expect(renameTakenAliases(body, [])).toEqual(body);
  });

  it("renameTakenAliases numbers a repeated alias after the first one got its own name", () => {
    const repeated = [
      rootTypeAlias("Record", "schemas", "Record"),
      rootTypeAlias("Pet", "schemas", "Pet"),
      rootTypeAlias("Record", "schemas", "record"),
      rootTypeAlias("Pet", "schemas", "pet"),
    ];
    const usesRecord: IrDeclaration = {
      kind: "typeAlias",
      name: "paths",
      isExported: true,
      type: irReference("Record", [irReference("string")]),
      comments: [],
    };

    const renamed = renameTakenAliases([usesRecord, ...repeated], []);

    expect(names(renamed)).toEqual(["paths", "Record_2", "Pet", "Record_3", "Pet_2"]);
  });
});

describe("rootTypeAlias", () => {
  it("rootTypeAlias refers to the component with single quotes", () => {
    expect(rootTypeAlias("Pet", "schemas", "Pet").type).toEqual({
      kind: "raw",
      text: "components['schemas']['Pet']",
    });
  });

  it("rootTypeAlias escapes quotes, backslashes and line breaks in the name", () => {
    const alias = rootTypeAlias("A", "schemas", "A'];\\\n");

    expect(alias.type).toEqual({ kind: "raw", text: "components['schemas']['A\\'];\\\\\\n']" });
  });
});
