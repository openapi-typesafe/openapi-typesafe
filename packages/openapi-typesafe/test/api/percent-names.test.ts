import { describe, expect, it } from "vitest";
import openapiTS, { astToString, createRef, type OpenAPI3 } from "../../src/index.js";

/** Names with `%` generate instead of crashing (upstream #2251, #2828). */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Rate: {
        type: "object",
        properties: {
          "50%": { type: "string" },
          "a%2Fb": { type: "string" },
          "x%zz": { type: "object", properties: { inner: { type: "string" } } },
        },
      },
    },
  },
};

describe("names with a percent sign", () => {
  it("openapiTS generates properties whose names contain %", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true }));

    expect(output).toContain('"50%"?: string;');
    expect(output).toContain('"a%2Fb"?: string;');
    expect(output).toContain('"x%zz"?: {');
  });

  it("the exported createRef escapes % like the generator", () => {
    expect(createRef(["#/a", "50%"])).toBe("#/a/50%25");
  });
});
