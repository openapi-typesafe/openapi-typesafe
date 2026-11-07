import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import { documentWith } from "./defensive-helpers.js";

/**
 * Path keys are scanned for `{name}` templates. A key of many `{` and no `}` made each scan
 * quadratic: 36 seconds for one key of 320,000 characters (audit B2, F3).
 */
const OPEN_BRACES = 320_000;
/** A linear scan takes milliseconds; the budget only catches a quadratic one. */
const TIME_BUDGET_MS = 5_000;

const responses = { 200: { description: "OK" } };

describe("path template scan", () => {
  it.each([
    ["default options", {}],
    ["--path-params-as-types", { pathParamsAsTypes: true }],
  ])("a path key of unclosed `{` generates in linear time with %s", async (_, options) => {
    const key = `/${"{".repeat(OPEN_BRACES)}`;
    const document = documentWith({}, { [key]: { get: { responses } } });
    const startedAt = performance.now();

    const output = astToString(await openapiTS(document as never, { silent: true, ...options }));

    expect(performance.now() - startedAt).toBeLessThan(TIME_BUDGET_MS);
    expect(output).toContain("{{{{");
  });
});
