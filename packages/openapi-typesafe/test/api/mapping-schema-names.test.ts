import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";

/** A discriminator `mapping` that names its schemas (`cat: Cat`), as OpenAPI allows. */

const DOCUMENT = `
openapi: 3.0.3
info: { title: t, version: "1" }
paths: {}
components:
  schemas:
    Pet:
      oneOf:
        - $ref: "#/components/schemas/Cat"
        - $ref: "#/components/schemas/Dog"
      discriminator:
        propertyName: petType
        mapping: { cat: Cat, dog: "#/components/schemas/Dog" }
    Cat: { type: object, required: [petType], properties: { petType: { type: string } } }
    Dog: { type: object, required: [petType], properties: { petType: { type: string } } }
`;

describe("mapping schema names", () => {
  it("openapiTS reads a mapping value that names a schema as that schema", async () => {
    const output = astToString(await openapiTS(DOCUMENT, { silent: true }));

    expect(output).toMatch(/Cat: \{\n(?:.*\n){4}\s+petType: "cat";/);
    expect(output).toMatch(/Dog: \{\n(?:.*\n){4}\s+petType: "dog";/);
  });
});
