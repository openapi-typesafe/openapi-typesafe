import { describe, expect, it } from "vitest";
import {
  renameAliasesTakenByFooter,
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

describe("renameAliasesTakenByFooter", () => {
  it("renameAliasesTakenByFooter with a colliding alias adds the suffix _2", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];

    const renamed = renameAliasesTakenByFooter(body, [enumDeclaration("Pet")]);

    expect(names(renamed)).toEqual(["Pet_2"]);
  });

  it("renameAliasesTakenByFooter skips suffixes that are already taken", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet"), rootTypeAlias("Pet_2", "schemas", "X")];

    const renamed = renameAliasesTakenByFooter(body, [enumDeclaration("Pet")]);

    expect(names(renamed)).toEqual(["Pet_3", "Pet_2"]);
  });

  it("renameAliasesTakenByFooter keeps aliases that are not root type aliases", () => {
    const alias: IrDeclaration = {
      kind: "typeAlias",
      name: "Pet",
      isExported: true,
      type: irReference("Other"),
      comments: [],
    };

    const renamed = renameAliasesTakenByFooter([alias], [enumDeclaration("Pet")]);

    expect(renamed).toEqual([alias]);
  });

  it("renameAliasesTakenByFooter renames an alias that a helper type takes", () => {
    const body = [rootTypeAlias("WithRequired", "schemas", "WithRequired")];
    const helper: IrDeclaration = {
      kind: "rawDeclaration",
      name: "WithRequired",
      text: "type WithRequired<T> = T;",
    };

    expect(names(renameAliasesTakenByFooter(body, [helper]))).toEqual(["WithRequired_2"]);
  });

  it("renameAliasesTakenByFooter ignores unnamed raw code and value declarations", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];
    const injected: IrDeclaration = { kind: "rawDeclaration", text: "type Pet = string;" };
    const values = {
      kind: "constArray",
      name: "Pet",
      isExported: true,
      values: [],
      comments: [],
    } as never;

    expect(renameAliasesTakenByFooter(body, [injected, values])).toEqual(body);
  });

  it("renameAliasesTakenByFooter with an empty footer returns the body unchanged", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];

    expect(renameAliasesTakenByFooter(body, [])).toEqual(body);
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
