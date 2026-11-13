import { describe, expect, it } from "vitest";
import { componentEnumNames } from "../../../../src/application/transform/footer/component-enum-names.js";
import type { DocumentObject } from "../../../../src/domain/openapi/document-object.js";

describe("componentEnumNames", () => {
  it("componentEnumNames gives each component schema's enum name", () => {
    const document = { components: { schemas: { Pair_2: {}, "my-status": {} } } } as DocumentObject;

    expect([...componentEnumNames(document)]).toEqual(["Pair_2", "MyStatus"]);
  });

  it("componentEnumNames leaves out a schema name with no valid character", () => {
    const document = { components: { schemas: { "-": {} } } } as DocumentObject;

    expect([...componentEnumNames(document)]).toEqual([]);
  });

  it("componentEnumNames of a document without components is empty", () => {
    expect([...componentEnumNames({} as DocumentObject)]).toEqual([]);
  });
});
