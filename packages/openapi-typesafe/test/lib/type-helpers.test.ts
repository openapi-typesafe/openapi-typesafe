import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseStatements } from "../../src/adapters/type-ast-bridge/ir-declarations-to-typescript.js";
import { astToString } from "../../src/index.js";
import type { FooterEntry } from "../../src/lib/footer-entry.js";
import {
  BOOLEAN,
  NULL,
  NUMBER,
  oapiRef,
  STRING,
  tsIntersection,
  tsLiteral,
  tsNullable,
  tsOmit,
  tsRecord,
  tsUnion,
  tsWithRequired,
} from "../../src/lib/type-helpers.js";

const TS_DATE = ts.factory.createTypeReferenceNode("Date");
const WITH_REQUIRED = "type WithRequired<T, K extends keyof T> = T & {\n    [P in K]-?: T[P];\n};";

function printed(type: Parameters<typeof astToString>[0]): string {
  return astToString(type).trim();
}

describe("type helpers", () => {
  it("tsUnion reads a TypeScript type node from user code into IR", () => {
    const union = tsUnion([TS_DATE, NULL]);

    expect(typeof union.kind).toBe("string");
    expect(printed(union)).toBe("Date | null");
  });

  it("tsIntersection removes repeated primitives", () => {
    expect(printed(tsIntersection([STRING, STRING, TS_DATE]))).toBe("string & Date");
  });

  it("tsNullable keeps repeated types", () => {
    expect(printed(tsNullable([NUMBER, NUMBER]))).toBe("number | number | null");
  });

  it("tsOmit omits the keys", () => {
    expect(printed(tsOmit(oapiRef("#/components/schemas/A"), ["a", "b"]))).toBe(
      'Omit<components["schemas"]["A"], "a" | "b">',
    );
  });

  it("tsRecord builds a Record", () => {
    expect(printed(tsRecord(STRING, BOOLEAN))).toBe("Record<string, boolean>");
  });

  it("tsLiteral types a JSON value", () => {
    expect(printed(tsLiteral({ a: [1, "x"] }))).toBe('{\n    a: [\n        1,\n        "x"\n    ];\n}');
  });
});

describe("tsWithRequired", () => {
  it("returns the type itself for no keys and adds no helper", () => {
    const footer: FooterEntry[] = [];

    expect(printed(tsWithRequired(TS_DATE, [], footer))).toBe("Date");
    expect(footer).toEqual([]);
  });

  it("adds the WithRequired helper to the footer once", () => {
    const footer: FooterEntry[] = [];

    tsWithRequired(STRING, ["a"], footer);
    const type = tsWithRequired(STRING, ["a", "b"], footer);

    expect(printed(type)).toBe('WithRequired<string, "a" | "b">');
    expect(footer).toEqual([{ kind: "rawDeclaration", name: "WithRequired", text: WITH_REQUIRED }]);
  });

  it("adds no helper when the user declared WithRequired already", () => {
    const footer: FooterEntry[] = [...parseStatements(ts, "type WithRequired<T, K> = T;")];

    tsWithRequired(STRING, ["a"], footer);

    expect(footer).toHaveLength(1);
  });
});

describe("oapiRef", () => {
  it("indexes a component and skips object properties", () => {
    expect(printed(oapiRef("#/components/schemas/A/properties/b"))).toBe('components["schemas"]["A"]["b"]');
  });

  it("wraps with FlattenedDeepRequired and Extract when asked", () => {
    const type = oapiRef("#/components/schemas/A/properties/b", undefined, {
      deep: true,
      extractProperties: ["b"],
    });

    expect(printed(type)).toBe(
      'Extract<FlattenedDeepRequired<components>["schemas"]["A"], {\n    b: unknown;\n}>["b"]',
    );
  });

  it("indexes a referenced parameter by its location", () => {
    const type = oapiRef("#/components/parameters/Limit", { in: "query", name: "limit" });

    expect(printed(type)).toBe('components["parameters"]["Limit"]');
  });

  it("ignores a reference object as the resolved value", () => {
    const type = oapiRef("#/components/parameters/Limit", { $ref: "#/components/parameters/Other" });

    expect(printed(type)).toBe('components["parameters"]["Limit"]');
  });
});
