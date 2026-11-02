import { describe, expect, it } from "vitest";
import {
  renameAliasesTakenByEnums,
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

describe("renameAliasesTakenByEnums", () => {
  it("renameAliasesTakenByEnums with a colliding alias adds the suffix _2", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];

    const renamed = renameAliasesTakenByEnums(body, [enumDeclaration("Pet")]);

    expect(names(renamed)).toEqual(["Pet_2"]);
  });

  it("renameAliasesTakenByEnums skips suffixes that are already taken", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet"), rootTypeAlias("Pet_2", "schemas", "X")];

    const renamed = renameAliasesTakenByEnums(body, [enumDeclaration("Pet")]);

    expect(names(renamed)).toEqual(["Pet_3", "Pet_2"]);
  });

  it("renameAliasesTakenByEnums keeps aliases that are not root type aliases", () => {
    const alias: IrDeclaration = {
      kind: "typeAlias",
      name: "Pet",
      isExported: true,
      type: irReference("Other"),
      comments: [],
    };

    const renamed = renameAliasesTakenByEnums([alias], [enumDeclaration("Pet")]);

    expect(renamed).toEqual([alias]);
  });

  it("renameAliasesTakenByEnums without enums returns the body unchanged", () => {
    const body = [rootTypeAlias("Pet", "schemas", "Pet")];

    expect(renameAliasesTakenByEnums(body, [])).toEqual(body);
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
