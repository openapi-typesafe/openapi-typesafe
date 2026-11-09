import { describe, expect, it } from "vitest";
import {
  type FooterSink,
  RunFooter,
} from "../../../../src/application/transform/footer/document-footer.js";
import { EnumNameClaims } from "../../../../src/application/transform/footer/enum-name-claims.js";
import { FIRST_SCHEMA_NAMES } from "../../../../src/application/transform/footer/shared-enum-names.js";
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

const STATUS = { name: "status", isComponentSchema: false, values: ["a", "b"], metadata: [] };

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

  it("addEnum numbers the enum of another schema whose name comes out the same", () => {
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, false);

    const first = footer.addEnum({ ...STATUS, name: "/status", values: ["active"] });
    const second = footer.addEnum({ ...STATUS, name: "/Status", values: ["deleted"] });

    expect([first, second]).toEqual(["Status", "Status_2"]);
    expect(sink.declarations.map((declaration) => declaration.kind)).toEqual(["enum", "enum"]);
  });

  it("addEnum with --dedupe-enums numbers other members whose name comes out the same", () => {
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, true);

    const first = footer.addEnum({ ...STATUS, name: "/status", values: ["active"] });
    const second = footer.addEnum({ ...STATUS, name: "/Status", values: ["deleted"] });

    expect([first, second]).toEqual(["Status", "Status_2"]);
  });

  it("addEnum merges the requests of one schema location into one enum name", () => {
    // A property and an inline `allOf` item of one schema are typed at one location.
    const sink = new InMemorySink();
    const footer = new RunFooter(sink, true);

    const first = footer.addEnum({ ...STATUS, name: "/Pet/kind", values: ["a"] });
    const second = footer.addEnum({ ...STATUS, name: "/Pet/kind", values: ["b"] });

    expect([first, second]).toEqual(["PetKind", "PetKind"]);
  });

  it("addEnum gives way to a name the run's claims reserve", () => {
    const sink = new InMemorySink();
    const names = { enums: new EnumNameClaims(new Set(["Record"])) };
    const footer = new RunFooter(sink, false, FIRST_SCHEMA_NAMES, names);

    expect(footer.addEnum({ ...STATUS, name: "/Record" })).toBe("Record_2");
  });

  it("addEnumValues adds the helper types once, then a readonly array", () => {
    const sink = new InMemorySink(["ReadonlyArray"]);
    const footer = new RunFooter(sink, false);
    const request = { name: "StatusValues", type: irReference("T"), values: ["a"] };

    footer.addEnumValues(request);
    footer.addEnumValues({ ...request, name: "OtherValues" });

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

  it("addEnumValues adds the same array once, so it is not declared twice", () => {
    // A discriminated union's own keywords are typed again in each member that inherits them.
    const sink = new InMemorySink(["ReadonlyArray", "FlattenedDeepRequired"]);
    const footer = new RunFooter(sink, false);
    const request = { name: "StatusValues", type: irReference("T"), values: ["a"] };

    footer.addEnumValues(request);
    footer.addEnumValues(request);
    footer.addEnumValues({ ...request, values: ["a", "b"] });

    expect(sink.declarations.map((declaration) => declaration.kind)).toEqual([
      "constArray",
      "constArray",
    ]);
  });

  it("addEnumValues numbers an array whose name another array has", () => {
    // `Discount/type` and `discount/type`, or two `anyOf` variants, give one name.
    const sink = new InMemorySink(["ReadonlyArray", "FlattenedDeepRequired"]);
    const footer = new RunFooter(sink, false);
    const request = { name: "DiscountTypeValues", type: irReference("T"), values: ["a"] };

    footer.addEnumValues(request);
    footer.addEnumValues({ ...request, type: irReference("U") });
    footer.addEnumValues({ ...request, values: ["b"] });
    footer.addEnumValues({ ...request, values: ["b"] });

    expect(
      sink.declarations.map((declaration) => "name" in declaration && declaration.name),
    ).toEqual(["discountTypeValues", "discountTypeValues_2", "discountTypeValues_3"]);
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
