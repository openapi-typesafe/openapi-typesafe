import { describe, expect, it } from "vitest";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { pointerType } from "../../../src/application/transform/pointer-type.js";
import { InvalidRefError } from "../../../src/application/transform/ref-type.js";

function printPointer(ref: string): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: pointerType(ref) }]).slice("type T = ".length, -2);
}

const RESPONSE = "#/paths/~1items/get/responses/200/content/application~1json";

describe("pointerType", () => {
  it("pointerType of a component schema is the refType", () => {
    expect(printPointer("#/components/schemas/Foo")).toBe('components["schemas"]["Foo"]');
  });

  it("pointerType indexes properties by name, also a property named properties", () => {
    expect(printPointer("#/components/schemas/Foo/properties/properties/properties/id")).toBe(
      'components["schemas"]["Foo"]["properties"]["id"]',
    );
  });

  it("pointerType drops the schema keyword of a media type", () => {
    expect(printPointer(`${RESPONSE}/schema/properties/id`)).toBe(
      'paths["/items"]["get"]["responses"]["200"]["content"]["application/json"]["id"]',
    );
  });

  it("pointerType drops the schema keyword of a header and a component parameter", () => {
    expect(printPointer("#/components/headers/Rate/schema")).toBe('components["headers"]["Rate"]');
    expect(printPointer("#/components/parameters/Page/schema")).toBe(
      'components["parameters"]["Page"]',
    );
  });

  it("pointerType indexes items by number and additionalProperties by string", () => {
    expect(printPointer("#/components/schemas/A/items/additionalProperties/properties/id")).toBe(
      'NonNullable<NonNullable<components["schemas"]["A"]>[number]>[string]["id"]',
    );
  });

  it("pointerType skips allOf members and narrows anyOf and oneOf members", () => {
    expect(printPointer("#/components/schemas/A/allOf/0/properties/id")).toBe(
      'components["schemas"]["A"]["id"]',
    );
    expect(printPointer("#/components/schemas/A/oneOf/1/properties/id")).toBe(
      'Extract<components["schemas"]["A"], {\n    id: unknown;\n}>["id"]',
    );
  });

  it("pointerType keeps the NonNullable of a $defs member", () => {
    expect(printPointer("#/components/schemas/A/$defs/properties/properties/id")).toBe(
      'NonNullable<components["schemas"]["A"]["$defs"]>["properties"]["id"]',
    );
  });

  it("pointerType indexes other keywords and segments outside schemas as they are", () => {
    expect(printPointer("#/components/schemas/A/not/allOf/x")).toBe(
      'components["schemas"]["A"]["not"]["x"]',
    );
    expect(printPointer("#/components/responses/R/headers/X")).toBe(
      'components["responses"]["R"]["headers"]["X"]',
    );
  });

  it("pointerType without a pointer throws InvalidRefError", () => {
    expect(() => pointerType("other.yaml")).toThrow(InvalidRefError);
  });
});
