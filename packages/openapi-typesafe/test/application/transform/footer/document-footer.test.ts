import { describe, expect, it } from "vitest";
import {
  type FooterSink,
  RunFooter,
} from "../../../../src/application/transform/footer/document-footer.js";
import { irProperty, irReference } from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrPropertySignature } from "../../../../src/domain/ir/nodes.js";

/** An in-memory sink: declarations in order, operations built eagerly. */
class InMemorySink implements FooterSink {
  readonly declarations: IrDeclaration[] = [];
  readonly operations: IrPropertySignature[] = [];
  private readonly typeAliases: Set<string>;

  constructor(typeAliases: readonly string[] = []) {
    this.typeAliases = new Set(typeAliases);
  }

  hasTypeAlias(name: string): boolean {
    return this.typeAliases.has(name);
  }

  add(declaration: IrDeclaration): void {
    this.declarations.push(declaration);
    if (declaration.kind === "rawDeclaration") {
      this.typeAliases.add(declaration.text.split(/[ <]/)[1] as string);
    }
  }

  addOperation(build: () => IrPropertySignature): void {
    this.operations.push(build());
  }
}

const STATUS = { name: "status", values: ["a", "b"], metadata: [] };

describe("RunFooter", () => {
  it("addEnum adds an enum and returns its name", () => {
    const sink = new InMemorySink();

    const name = new RunFooter(sink, false).addEnum(STATUS);

    expect(name).toBe("Status");
    expect(sink.declarations.map((declaration) => declaration.kind)).toEqual(["enum"]);
  });

  it("addEnum with --dedupe-enums reuses the first enum with the same members", () => {
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, true);

    footer.addEnum(STATUS);
    const name = footer.addEnum({ ...STATUS, name: "other", values: ["b", "a"] });

    expect(name).toBe("Status");
    expect(sink.declarations).toHaveLength(1);
  });

  it("addEnum without --dedupe-enums adds every enum with other members", () => {
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, false);

    footer.addEnum(STATUS);
    footer.addEnum({ ...STATUS, name: "other", values: ["b", "a"] });

    expect(sink.declarations).toHaveLength(2);
  });

  it("addEnum adds the same declaration once, so it does not repeat its members", () => {
    // A discriminator patched by both a parent mapping and a `oneOf` asked for its enum twice,
    // and the file failed with "Duplicate identifier".
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, false);

    const first = footer.addEnum(STATUS);
    const second = footer.addEnum(STATUS);

    expect([first, second]).toEqual(["Status", "Status"]);
    expect(sink.declarations).toHaveLength(1);
  });

  it("addEnumValues adds the helper types once, then a readonly array", () => {
    const sink = new InMemorySink(["ReadonlyArray"]);
    const footer = new RunFooter(sink, false);
    const request = { name: "StatusValues", type: irReference("T"), values: ["a"] };

    footer.addEnumValues(request);
    footer.addEnumValues(request);

    expect(sink.declarations.map((declaration) => declaration.kind)).toEqual([
      "rawDeclaration",
      "constArray",
      "constArray",
    ]);
    expect(sink.declarations[1]).toMatchObject({
      name: "statusValues",
      type: irReference("ReadonlyArray", [irReference("T")]),
    });
  });

  it("requireWithRequired adds the helper only when it is not declared", () => {
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, false);

    footer.requireWithRequired();
    footer.requireWithRequired();

    expect(sink.declarations).toHaveLength(1);
  });

  it("addOperation passes the member builder to the sink", () => {
    const sink = new InMemorySink();
    const member = irProperty({ kind: "identifier", text: "get" }, irReference("T"));

    new RunFooter(sink, false).addOperation(() => member);

    expect(sink.operations).toEqual([member]);
  });
});
