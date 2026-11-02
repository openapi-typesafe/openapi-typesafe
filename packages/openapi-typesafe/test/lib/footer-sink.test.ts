import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseStatements } from "../../src/adapters/type-ast-bridge/ir-declarations-to-typescript.js";
import { irProperty, irReference } from "../../src/domain/ir/constructors.js";
import type { IrDeclaration } from "../../src/domain/ir/nodes.js";
import { astToString } from "../../src/index.js";
import type { FooterEntry } from "../../src/lib/footer-entry.js";
import { ContextFooterSink } from "../../src/lib/footer-sink.js";

const ALIAS: IrDeclaration = {
  kind: "typeAlias",
  name: "A",
  isExported: true,
  type: irReference("B"),
  comments: [],
};
const MEMBER = irProperty({ kind: "identifier", text: "listItems" }, irReference("T"));

function userNode(source: string): ts.Node {
  const [node] = [...parseStatements(ts, source)];
  return node as ts.Node;
}

describe("ContextFooterSink", () => {
  it("add pushes the declaration to the footer", () => {
    const footer: FooterEntry[] = [];
    const sink = new ContextFooterSink(footer);

    sink.add(ALIAS);

    expect(footer).toEqual([ALIAS]);
    expect(sink.hasTypeAlias("A")).toBe(true);
  });

  it("hasTypeAlias sees a named raw declaration and a user's TypeScript alias", () => {
    const footer: FooterEntry[] = [
      { kind: "rawDeclaration", name: "Raw", text: "type Raw = 1;" },
      userNode("type User = 1;"),
    ];
    const sink = new ContextFooterSink(footer);

    expect(sink.hasTypeAlias("Raw")).toBe(true);
    expect(sink.hasTypeAlias("User")).toBe(true);
    expect(sink.hasTypeAlias("Other")).toBe(false);
  });

  it("addOperation declares the operations interface once and adds each member", () => {
    const footer: FooterEntry[] = [];
    const sink = new ContextFooterSink(footer);

    sink.addOperation(() => MEMBER);
    sink.addOperation(() => MEMBER);

    expect(footer).toHaveLength(1);
    expect(footer[0]).toMatchObject({ kind: "interface", name: "operations", members: [MEMBER, MEMBER] });
  });

  it("addOperation declares the interface before what the member build adds", () => {
    const footer: FooterEntry[] = [];
    const sink = new ContextFooterSink(footer);

    sink.addOperation(() => {
      sink.add(ALIAS);
      return MEMBER;
    });

    expect(footer.map((entry) => (entry as IrDeclaration).kind)).toEqual(["interface", "typeAlias"]);
  });

  it("addOperation adds the member to a user's TypeScript operations interface in place", () => {
    const operations = userNode("export interface operations {}");
    const footer: FooterEntry[] = [operations];
    const sink = new ContextFooterSink(footer);

    sink.addOperation(() => MEMBER);

    expect(footer).toEqual([operations]);
    expect(astToString(operations)).toBe("export interface operations {\n    listItems: T;\n}\n");
  });
});
