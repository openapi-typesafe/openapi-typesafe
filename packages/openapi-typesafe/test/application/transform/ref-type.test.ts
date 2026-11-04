import { describe, expect, it } from "vitest";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import {
  InvalidRefError,
  type RefTypeOptions,
  refType,
} from "../../../src/application/transform/ref-type.js";

function printRef(ref: string, options?: RefTypeOptions): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: refType(ref, options) }]).slice("type T = ".length, -2);
}

describe("refType", () => {
  it("refType indexes every segment of a component ref", () => {
    expect(printRef("#/components/schemas/Foo")).toBe('components["schemas"]["Foo"]');
  });

  it("refType with only a root segment is the root type", () => {
    expect(printRef("#/components")).toBe("components");
  });

  it("refType escapes non-ASCII segments like the TypeScript printer", () => {
    expect(printRef("#/components/schemas/Café")).toBe('components["schemas"]["Caf\\u00E9"]');
  });

  it("refType skips properties segments after the first three", () => {
    expect(printRef("#/components/schemas/Foo/properties/bar/properties/baz")).toBe(
      'components["schemas"]["Foo"]["bar"]["baz"]',
    );
  });

  it("refType keeps a properties segment among the first three", () => {
    expect(printRef("#/components/properties/Foo")).toBe('components["properties"]["Foo"]');
  });

  it("refType with isDeep wraps the root in FlattenedDeepRequired", () => {
    expect(printRef("#/components/schemas/Foo", { isDeep: true })).toBe(
      'FlattenedDeepRequired<components>["schemas"]["Foo"]',
    );
  });

  it("refType with a parameter target indexes the last segment by in and name", () => {
    const parameter = { in: "query", name: "page" };

    expect(printRef("#/paths/~1items/get/parameters/0", { parameter })).toBe(
      'paths["/items"]["get"]["parameters"]["query"]["page"]',
    );
  });

  it("refType with extractProperties narrows the union before indexing", () => {
    expect(
      printRef("#/components/schemas/Pet/properties/cat", { extractProperties: ["cat"] }),
    ).toBe('Extract<components["schemas"]["Pet"], {\n    cat: unknown;\n}>["cat"]');
  });

  it("refType with extractProperties quotes a property name that is not an identifier", () => {
    const ref = "#/components/schemas/Pet/properties/content-type";

    expect(printRef(ref, { extractProperties: ["content-type"] })).toBe(
      'Extract<components["schemas"]["Pet"], {\n    "content-type": unknown;\n}>["content-type"]',
    );
  });

  it("refType without a pointer throws InvalidRefError with the original message", () => {
    expect(() => refType("other.yaml")).toThrow(new InvalidRefError("other.yaml").message);
    expect(() => refType("#/")).toThrow(InvalidRefError);
  });
});
