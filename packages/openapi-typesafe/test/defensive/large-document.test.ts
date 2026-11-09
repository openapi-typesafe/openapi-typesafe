import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import { documentWith, generateCompiling } from "./defensive-helpers.js";

/** Enough operations and schemas to make a quadratic step take minutes. */
const OPERATION_COUNT = 5_000;
/**
 * The run takes about one second on a laptop. The budget is far above that, to fail on a
 * quadratic slowdown or a hang, not on a slow CI machine.
 */
const TIME_BUDGET_MS = 30_000;

/**
 * Past the arguments a call takes in V8 (about 125,000): a list this long that a step spreads into
 * a call (`push(...items)`) throws a RangeError.
 */
const WIDE_LIST_LENGTH = 150_000;

const wideList = <T>(item: (index: number) => T): T[] =>
  Array.from({ length: WIDE_LIST_LENGTH }, (_, index) => item(index));

/**
 * Schemas with one list as long as WIDE_LIST_LENGTH: every walk of the document visits the enum,
 * and the comment step reads the examples. An `anyOf` of that length takes the same walk and makes
 * a union of 150,000 members, which takes seconds and slows the other tests on a CI runner.
 */
const WIDE_SCHEMAS: readonly { name: string; schema: Record<string, unknown> }[] = [
  { name: "an enum", schema: { type: "string", enum: wideList((index) => `v${index}`) } },
  { name: "examples", schema: { type: "string", examples: wideList((index) => `v${index}`) } },
];

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

describe("wide lists", () => {
  it.each(WIDE_SCHEMAS)(
    "a schema with $name of 150,000 items generates",
    async ({ schema }) => {
      const source = documentWith({ Wide: schema });

      const output = astToString(await openapiTS(source as never, { silent: true }));

      expect(output).toContain(`v${WIDE_LIST_LENGTH - 1}`);
    },
    TIME_BUDGET_MS,
  );
});
