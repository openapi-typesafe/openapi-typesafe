import { describe, expect, it } from "vitest";
import {
  NAMES_THE_OUTPUT_MAY_NEED,
  namesTheOutputNeeds,
  withEnumDeclarationsMerged,
  withEnumsRenamed,
} from "../../../../src/application/transform/document/enum-names-given-back.js";
import { rootTypeAlias } from "../../../../src/application/transform/document/root-type-aliases.js";
import {
  irIndexedAccess,
  irReference,
  irString,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrEnumDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

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

describe("withEnumDeclarationsMerged", () => {
  const modeOf = (...members: [string, string][]): IrEnumDeclaration => ({
    kind: "enum",
    name: "Mode",
    isExported: true,
    members: members.map(([name, value]) => ({ name, value, comments: [] })),
    comments: [],
  });
  const enumOf = (entry: IrDeclaration) => (entry.kind === "enum" ? entry : null);

  it("withEnumDeclarationsMerged adds the new members to the first declaration of the name", () => {
    const declarations = [
      modeOf(["a", "a"]),
      aliasOf("X", irReference("Y")),
      modeOf(["a", "a"], ["b", "b"]),
    ];

    const merged = withEnumDeclarationsMerged(declarations, enumOf);

    expect(merged).toEqual([modeOf(["a", "a"], ["b", "b"]), aliasOf("X", irReference("Y"))]);
  });

  it("withEnumDeclarationsMerged drops the members of every earlier declaration of the name", () => {
    const merged = withEnumDeclarationsMerged(
      [modeOf(["a", "a"]), modeOf(["b", "b"]), modeOf(["a", "a"], ["c", "c"])],
      enumOf,
    );

    expect(merged).toEqual([modeOf(["a", "a"], ["b", "b"], ["c", "c"])]);
  });

  it("withEnumDeclarationsMerged keeps the first declaration's comments", () => {
    const first = { ...modeOf(["a", "a"]), comments: [{ kind: "line" as const, text: "first" }] };

    const merged = withEnumDeclarationsMerged([first, modeOf(["b", "b"])], enumOf);

    expect(merged).toEqual([{ ...modeOf(["a", "a"], ["b", "b"]), comments: first.comments }]);
  });

  it("withEnumDeclarationsMerged drops a later declaration left without members", () => {
    const merged = withEnumDeclarationsMerged([modeOf(["a", "a"]), modeOf(["a", "a"])], enumOf);

    expect(merged).toEqual([modeOf(["a", "a"])]);
  });

  it("withEnumDeclarationsMerged numbers a member whose name another value has", () => {
    const merged = withEnumDeclarationsMerged([modeOf(["a", "a"]), modeOf(["a", "A"])], enumOf);

    expect(merged).toEqual([modeOf(["a", "a"], ["a_2", "A"])]);
  });

  it("withEnumDeclarationsMerged keeps the first declaration of an empty enum", () => {
    const merged = withEnumDeclarationsMerged([modeOf(), modeOf()], enumOf);

    expect(merged).toEqual([modeOf()]);
  });

  it("withEnumDeclarationsMerged keeps declarations of other names apart", () => {
    const other = { ...modeOf(["a", "a"]), name: "Other" };

    expect(withEnumDeclarationsMerged([modeOf(["a", "a"]), other], enumOf)).toEqual([
      modeOf(["a", "a"]),
      other,
    ]);
  });
});
