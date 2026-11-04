import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `anyof-properties` fix (ADR-021, roadmap R8, upstream #2380). */

const EMAIL = {
  type: "object",
  required: ["type", "address"],
  properties: { type: { type: "string", enum: ["email"] }, address: { type: "string" } },
};
const PHONE = {
  type: "object",
  required: ["type", "number"],
  properties: { type: { type: "string", enum: ["phone"] }, number: { type: "string" } },
};
const VARIANTS = [{ $ref: "#/components/schemas/Email" }, { $ref: "#/components/schemas/Phone" }];
const NAME = { name: { type: "string" } };
const UNION = 'components["schemas"]["Email"] | components["schemas"]["Phone"]';

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: { Email: EMAIL, Phone: PHONE, ...schemas } },
  } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>): Promise<string> {
  return generate(documentWith(schemas), { fix: ["anyof-properties"] });
}

const CONTACT_ALIAS = 'type Contact = components["schemas"]["Contact"];';
const CONTACT = { Contact: { type: "object", properties: NAME, anyOf: VARIANTS } };

describe("anyof-properties fix", () => {
  it("openapiTS without the fix keeps the sibling object as a union member", async () => {
    const output = await generate(documentWith(CONTACT));

    expect(output).toContain(`Contact: {\n            name?: string;\n        } | ${UNION};`);
  });

  it("openapiTS with the fix intersects sibling properties with the anyOf union", async () => {
    const output = await fixed(CONTACT);

    expect(output).toContain(`Contact: {\n            name?: string;\n        } & (${UNION});`);
  });

  it("openapiTS with the fix intersects allOf members with the anyOf union", async () => {
    const output = await fixed({
      Named: { type: "object", properties: NAME },
      Contact: { allOf: [{ $ref: "#/components/schemas/Named" }], anyOf: VARIANTS },
    });

    expect(output).toContain(`Contact: components["schemas"]["Named"] & (${UNION});`);
  });

  it("openapiTS with the fix keeps a bare anyOf a plain union", async () => {
    const output = await fixed({ Contact: { type: "object", anyOf: VARIANTS } });

    expect(output).toContain(`Contact: ${UNION};`);
  });

  it("openapiTS with the fix applies anyOf to each type of a list and keeps its null", async () => {
    const output = await fixed({
      Contact: { type: ["object", "null"], properties: NAME, anyOf: VARIANTS },
    });

    expect(output).toContain(`Contact: ({\n            name?: string;\n        } & (${UNION})) | null;`);
  });

  it("openapiTS with the fix accepts a value of one variant with the sibling property", async () => {
    const code = `${await fixed(CONTACT)}\nconst email: Contact = { name: "a", type: "email", address: "a" };`;

    expect(typeErrorsOf(`${code}\n${CONTACT_ALIAS}`)).toEqual([]);
  });

  it("openapiTS with the fix rejects a value that matches no anyOf variant", async () => {
    const code = `${await fixed(CONTACT)}\nconst named: Contact = { name: "a" };`;

    expect(typeErrorsOf(`${code}\n${CONTACT_ALIAS}`)).toHaveLength(1);
  });

  it("openapiTS without the fix accepts a value that matches no anyOf variant", async () => {
    const code = `${await generate(documentWith(CONTACT))}\nconst named: Contact = { name: "a" };`;

    expect(typeErrorsOf(`${code}\n${CONTACT_ALIAS}`)).toEqual([]);
  });
});
