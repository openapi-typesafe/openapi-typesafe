import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, tsEnum } from "../../src/index.js";

/** `--enum` output that did not compile (upstream #2807, #2812, #2614, #2838). */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Keys: { type: "string", enum: ["", "\\", "a"] },
      Codes: {
        type: "integer",
        enum: [100],
        "x-enum-descriptions": ["Code 100\nspanning two lines"],
      },
    },
  },
};

describe("--enum output that must compile", () => {
  it("openapiTS quotes and escapes member names that are no identifiers", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true, enum: true }));

    expect(output).toContain('    "" = "",\n    "\\\\" = "\\\\",\n    a = "a"');
  });

  it("openapiTS keeps a multi-line member description on one comment line", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true, enum: true }));

    expect(output).toContain("    // Code 100 spanning two lines\n    Value100 = 100");
  });

  it("the deprecated tsEnum quotes names and keeps comments on one line", () => {
    const output = astToString([tsEnum("Keys", ["", "\\"], [{ description: "x\ny" }, {}])]);

    expect(output).toContain('    // x y\n    "" = "",\n    "\\\\" = "\\\\"');
  });
});
