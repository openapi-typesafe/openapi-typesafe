import { describe, expect, it } from "vitest";
import { documentWith, generateCompiling } from "./defensive-helpers.js";

/** Enough operations and schemas to make a quadratic step take minutes. */
const OPERATION_COUNT = 5_000;
/**
 * The run takes about one second on a laptop. The budget is far above that, to fail on a
 * quadratic slowdown or a hang, not on a slow CI machine.
 */
const TIME_BUDGET_MS = 30_000;

/** One component schema and one operation per index, all different. */
function largeDocument(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  const paths: Record<string, unknown> = {};
  for (let index = 0; index < OPERATION_COUNT; index++) {
    schemas[`Model${index}`] = {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "integer" },
        tags: { type: "array", items: { type: "string", enum: ["a", "b"] } },
      },
    };
    const content = { "application/json": { schema: { $ref: `#/components/schemas/Model${index}` } } };
    paths[`/models${index}/{id}`] = {
      get: {
        operationId: `getModel${index}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "OK", content } },
      },
    };
  }
  return documentWith(schemas, paths);
}

describe("large documents", () => {
  it(
    "a document with thousands of operations and schemas generates in time and compiles",
    async () => {
      const startedAt = performance.now();

      const output = await generateCompiling(largeDocument());

      expect(performance.now() - startedAt).toBeLessThan(TIME_BUDGET_MS);
      expect(output).toContain(`Model${OPERATION_COUNT - 1}: {`);
    },
    TIME_BUDGET_MS * 2,
  );
});
