import ts from "typescript";
import { describe, expect, it } from "vitest";
import { irProperty, irReference } from "../../src/domain/ir/constructors.js";
import type { IrDeclaration } from "../../src/domain/ir/nodes.js";
import { LegacyFooterSink } from "../../src/lib/footer-sink.js";
import { stringToAST } from "../../src/lib/ts.js";

const ALIAS: IrDeclaration = {
  kind: "typeAlias",
  name: "A",
  isExported: true,
  type: irReference("B"),
  comments: [],
};
const MEMBER = irProperty({ kind: "identifier", text: "listItems" }, irReference("T"));

describe("LegacyFooterSink", () => {
  it("add pushes the node to the footer and remembers its IR", () => {
    const footer: ts.Node[] = [];
    const sink = new LegacyFooterSink(footer);

    sink.add(ALIAS);

    expect(footer).toHaveLength(1);
    expect(sink.declarationOf(footer[0] as ts.Node)).toBe(ALIAS);
    expect(sink.hasTypeAlias("A")).toBe(true);
  });

  it("declarationOf a node from elsewhere is null", () => {
    const [node] = stringToAST("type C = 1;") as ts.Node[];
    const sink = new LegacyFooterSink([node as ts.Node]);

    expect(sink.declarationOf(node as ts.Node)).toBeNull();
  });

  it("addOperation declares the operations interface once and keeps its members in IR", () => {
    const footer: ts.Node[] = [];
    const sink = new LegacyFooterSink(footer);

    sink.addOperation(() => MEMBER);
    sink.addOperation(() => MEMBER);

    expect(footer).toHaveLength(1);
    expect(sink.declarationOf(footer[0] as ts.Node)).toMatchObject({
      kind: "interface",
      name: "operations",
      members: [MEMBER, MEMBER],
    });
  });

  it("declarationOf the operations interface is null after an outside change", () => {
    const footer: ts.Node[] = [];
    const sink = new LegacyFooterSink(footer);
    sink.addOperation(() => MEMBER);
    const operations = footer[0] as ts.InterfaceDeclaration;

    (operations as { members: ts.NodeArray<ts.TypeElement> }).members = ts.factory.createNodeArray([]);

    expect(sink.declarationOf(operations)).toBeNull();
  });

  it("addOperation on a user's operations interface keeps it out of the IR", () => {
    const [operations] = stringToAST("export interface operations {}") as ts.Node[];
    const sink = new LegacyFooterSink([operations as ts.Node]);

    sink.addOperation(() => MEMBER);

    expect(sink.declarationOf(operations as ts.Node)).toBeNull();
  });
});
