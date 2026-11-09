import { describe, expect, it } from "vitest";
import {
  typeNamesDeclaredBy,
  typeNamesInText,
} from "../../../../src/application/transform/document/declared-type-names.js";
import { irKeyword } from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration } from "../../../../src/domain/ir/nodes.js";

describe("typeNamesInText", () => {
  it("typeNamesInText finds every type declaration at the start of a line", () => {
    const text = [
      "export type $Read<T> = { readonly $read: T };",
      "interface Pet {",
      "    type: string;",
      "}",
      "export declare const enum Kind {}",
      "class Box {}",
      "export const values = [];",
    ].join("\n");

    expect(typeNamesInText(text)).toEqual(["$Read", "Pet", "Kind", "Box"]);
  });
});

describe("typeNamesDeclaredBy", () => {
  it("typeNamesDeclaredBy names declarations and raw text, but not value arrays", () => {
    const declarations: IrDeclaration[] = [
      {
        kind: "typeAlias",
        name: "paths",
        isExported: true,
        type: irKeyword("never"),
        comments: [],
      },
      { kind: "rawDeclaration", name: "WithRequired", text: "type WithRequired<T> = T;" },
      { kind: "rawDeclaration", text: "type Injected = string;" },
      {
        kind: "constArray",
        name: "statusValues",
        isExported: true,
        type: irKeyword("never"),
        values: [],
        comments: [],
      },
    ];

    expect([...typeNamesDeclaredBy(declarations)]).toEqual(["paths", "WithRequired", "Injected"]);
  });
});
