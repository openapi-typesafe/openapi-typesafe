import { describe, expect, it } from "vitest";
import {
  NAMES_THE_OUTPUT_MAY_NEED,
  namesTheOutputNeeds,
  withEnumsRenamed,
} from "../../../../src/application/transform/document/enum-names-given-back.js";
import { rootTypeAlias } from "../../../../src/application/transform/document/root-type-aliases.js";
import {
  irIndexedAccess,
  irReference,
  irString,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

function enumNamed(name: string): IrDeclaration {
  return { kind: "enum", name, isExported: true, members: [], comments: [] };
}

function aliasOf(name: string, type: IrType): IrDeclaration {
  return { kind: "typeAlias", name, isExported: true, type, comments: [] };
}

describe("NAMES_THE_OUTPUT_MAY_NEED", () => {
  it("NAMES_THE_OUTPUT_MAY_NEED holds globals, helper types, marker types and fixed names", () => {
    const names = ["Blob", "Record", "WithRequired", "Readable", "ApiPaths", "$defs"];

    expect(names.filter((name) => !NAMES_THE_OUTPUT_MAY_NEED.has(name))).toEqual([]);
  });
});

describe("namesTheOutputNeeds", () => {
  it("namesTheOutputNeeds holds referenced globals and other declarations, not enums or aliases", () => {
    const body = [
      aliasOf("$defs", irReference("Record", [irReference("string")])),
      rootTypeAlias("Pet", "schemas", "Pet"),
    ];

    const needed = namesTheOutputNeeds({
      body,
      footer: [enumNamed("Status")],
      closing: [enumNamed("ApiPaths")],
    });

    expect([...needed].sort()).toEqual(["$defs", "ApiPaths", "Record"]);
  });
});

describe("withEnumsRenamed", () => {
  it("withEnumsRenamed renames the enum and each form of reference to it", () => {
    const declarations = [
      aliasOf(
        "T",
        irUnion([
          irReference("Blob_2"),
          irReference("Blob_2.a"),
          irIndexedAccess(irReference("typeof Blob_2"), irString("+", "escaped")),
          irReference("Blob_22"),
        ]),
      ),
      enumNamed("Blob_2"),
    ];

    const renamed = withEnumsRenamed(declarations, new Map([["Blob_2", "Blob"]]));

    expect(renamed).toEqual([
      aliasOf(
        "T",
        irUnion([
          irReference("Blob"),
          irReference("Blob.a"),
          irIndexedAccess(irReference("typeof Blob"), irString("+", "escaped")),
          irReference("Blob_22"),
        ]),
      ),
      enumNamed("Blob"),
    ]);
  });

  it("withEnumsRenamed keeps the outside node a raw type was printed from", () => {
    const origin = { kind: 1, name: "Blob_2" };
    const declarations = [aliasOf("T", { kind: "raw", text: "x", origin } as never)];

    const [renamed] = withEnumsRenamed(declarations, new Map([["Blob_2", "Blob"]]));

    expect((renamed as { type: { origin: unknown } }).type.origin).toBe(origin);
  });

  it("withEnumsRenamed without renames returns the declarations", () => {
    const declarations = [enumNamed("Blob_2")];

    expect(withEnumsRenamed(declarations, new Map())).toEqual(declarations);
  });
});
