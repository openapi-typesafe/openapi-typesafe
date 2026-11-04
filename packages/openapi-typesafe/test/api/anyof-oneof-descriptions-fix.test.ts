import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `anyof-oneof-descriptions` fix (ADR-021, upstream #2142). */

const DESCRIBED_MEMBERS = [
  { type: "boolean", description: "Description 1" },
  { type: "string", description: "Description 2" },
];

function documentWith(item: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: {
      schemas: {
        Other: { type: "number" },
        Holder: { type: "object", required: ["item"], properties: { item } },
        Item: item,
      },
    },
  } as unknown as OpenAPI3;
}

async function generate(item: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(documentWith(item), { silent: true, ...options }));
}

async function fixed(item: Record<string, unknown>) {
  return generate(item, { fix: ["anyof-oneof-descriptions"] });
}

const ONE_OF_LINES = [
  "             * @description One of:",
  "             *     - Description 1",
  "             *     - Description 2",
].join("\n");

describe("anyof-oneof-descriptions fix", () => {
  it("openapiTS without the fix drops the descriptions of the members", async () => {
    const output = await generate({ oneOf: DESCRIBED_MEMBERS });

    expect(output).not.toContain("Description 1");
  });

  it("openapiTS with the fix lists the oneOf member descriptions on the property", async () => {
    const output = await fixed({ oneOf: DESCRIBED_MEMBERS });

    expect(output).toContain(`${ONE_OF_LINES}\n             */\n            item: boolean | string;`);
  });

  it("openapiTS with the fix lists them on a component schema too", async () => {
    const output = await fixed({ oneOf: DESCRIBED_MEMBERS });

    expect(output).toContain("         * @description One of:\n         *     - Description 1");
    expect(output).toContain("Item: boolean | string;");
  });

  it("openapiTS with the fix keeps the schema's own description first", async () => {
    const output = await fixed({ description: "An item.", anyOf: DESCRIBED_MEMBERS });

    expect(output).toContain("* @description An item.\n             *     Any of:\n             *     - Description 1");
  });

  it("openapiTS with the fix lists anyOf and oneOf apart and skips members with no description", async () => {
    const output = await fixed({
      anyOf: [{ $ref: "#/components/schemas/Other" }, DESCRIBED_MEMBERS[0]],
      oneOf: [{ type: "string", description: "  " }, DESCRIBED_MEMBERS[1]],
    });

    expect(output).toContain("Any of:\n             *     - Description 1\n             *     One of:");
    expect(output).toContain("One of:\n             *     - Description 2\n             */");
  });

  it("openapiTS with the fix indents the later lines of a multi-line member description", async () => {
    const output = await fixed({ oneOf: [{ type: "string", description: "First\nSecond" }] });

    expect(output).toContain("*     - First\n             *       Second");
  });

  it("openapiTS with the fix reads the description next to a $ref member", async () => {
    const output = await fixed({
      oneOf: [{ $ref: "#/components/schemas/Other", description: "A count." }],
    });

    expect(output).toContain("*     - A count.");
  });

  it("openapiTS with the fix escapes a comment end in a member description", async () => {
    const output = await fixed({ oneOf: [{ type: "string", description: "a */ b" }] });

    expect(output).toContain("- a *\\/ b");
  });

  it("openapiTS with the fix changes no schema without described members", async () => {
    const item = { description: "Plain.", oneOf: [{ type: "string" }, { type: "number" }] };

    expect(await fixed(item)).toBe(await generate(item));
  });

  it("openapiTS output with the fix compiles", async () => {
    expect(typeErrorsOf(await fixed({ oneOf: DESCRIBED_MEMBERS }))).toEqual([]);
  });
});
