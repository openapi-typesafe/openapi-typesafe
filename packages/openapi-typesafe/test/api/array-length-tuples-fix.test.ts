import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `array-length-tuples` fix (ADR-021, roadmap R9; upstream #2048, #2330, #2546). */

const STRING = { type: "string" };
const FIXED: OpenAPITSOptions = { arrayLength: true, fix: ["array-length-tuples"] };

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas },
  } as OpenAPI3;
}

/** The output with tuples on one line, so a test can name a whole type. */
async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions): Promise<string> {
  const output = astToString(await openapiTS(documentWith(schemas), { silent: true, ...options }));
  return output.replace(/\[\s+/g, "[").replace(/\s+\]/g, "]").replace(/,\s+/g, ", ");
}

const RANGE = { Range: { type: "array", items: STRING, minItems: 1, maxItems: 2 } };

describe("array-length-tuples fix", () => {
  it("openapiTS with arrayLength and without the fix keeps the 0 to max - min tuples", async () => {
    expect(await generate(RANGE, { arrayLength: true })).toContain("Range: [] | [string];");
  });

  it("openapiTS with the fix writes tuples of min to max items (#2048)", async () => {
    expect(await generate(RANGE, FIXED)).toContain("Range: [string] | [string, string];");
  });

  it("openapiTS with the fix keeps a minItems-only array as items and a rest element", async () => {
    const output = await generate({ List: { type: "array", items: STRING, minItems: 1 } }, FIXED);

    expect(output).toContain("List: [string, ...string[]];");
  });

  it("openapiTS with the fix nests a length tuple in a length tuple once (#2330)", async () => {
    const inner = { type: "array", items: STRING, minItems: 1, maxItems: 1 };

    const output = await generate({ Grid: { type: "array", items: inner, minItems: 1, maxItems: 1 } }, FIXED);

    expect(output).toContain("Grid: [[string]];");
  });

  it("openapiTS with the fix nests a plain array in a length tuple once (#2546)", async () => {
    const inner = { type: "array", items: STRING };

    const output = await generate({ Grid: { type: "array", items: inner, minItems: 2, maxItems: 2 } }, FIXED);

    expect(output).toContain("Grid: [string[], string[]];");
  });

  it("openapiTS with the fix keeps nested arrays without bounds as they are", async () => {
    const schemas = { Grid: { type: "array", items: { type: "array", items: STRING } } };

    expect(await generate(schemas, FIXED)).toBe(await generate(schemas, { arrayLength: true }));
  });

  it("openapiTS with the fix and immutable makes every length tuple readonly", async () => {
    const output = await generate(RANGE, { ...FIXED, immutable: true });

    expect(output).toContain("readonly Range: readonly [string] | readonly [string, string];");
  });

  it("openapiTS with the fix and immutable makes rest tuples and plain arrays readonly", async () => {
    const schemas = { List: { type: "array", items: STRING, minItems: 1 }, Plain: { type: "array", items: STRING } };

    const output = await generate(schemas, { ...FIXED, immutable: true });

    expect(output).toContain("readonly List: readonly [string, ...string[]];");
    expect(output).toContain("readonly Plain: readonly string[];");
  });

  it("openapiTS with the fix types a tuple item given by a type list as an array of tuples", async () => {
    const schemas = { Pairs: { type: "array", items: { type: ["array"], prefixItems: [STRING, STRING] } } };

    expect(await generate(schemas, FIXED)).toContain("Pairs: [string, string][];");
    expect(await generate(schemas, { fix: ["array-length-tuples"] })).toContain("Pairs: [string, string];");
  });

  it("openapiTS with the fix puts no length tuples around a prefixItems tuple", async () => {
    const pair = { type: "array", prefixItems: [STRING, { type: "number" }], minItems: 2 };

    expect(await generate({ Pair: pair }, FIXED)).toContain("Pair: [string, number];");
  });

  it("openapiTS with the fix types an array without items as unknown items", async () => {
    const output = await generate({ Any: { type: "array", minItems: 1, maxItems: 1 } }, FIXED);

    expect(output).toContain("Any: [unknown];");
  });

  it("openapiTS with the fix and without arrayLength changes nothing", async () => {
    expect(await generate(RANGE, { fix: ["array-length-tuples"] })).toBe(await generate(RANGE, {}));
  });

  it("openapiTS with the fix rejects too few items and accepts the bounds", async () => {
    const code = `${await generate(RANGE, FIXED)}
type Range = components["schemas"]["Range"];
const one: Range = ["a"];
const two: Range = ["a", "b"];`;

    expect(typeErrorsOf(code)).toEqual([]);
    expect(typeErrorsOf(`${code}\nconst none: Range = [];`)).toHaveLength(1);
  });
});

describe("array-length-tuples notice", () => {
  async function warningsOf(options: OpenAPITSOptions): Promise<string[]> {
    const ports = await defaultGeneratorPorts({ silent: true });
    const logger = new RecordingLogger();
    const source = 'openapi: 3.1.0\ninfo: { title: t, version: "1" }\npaths: {}\n';
    await createDocumentRun(source, { silent: true, ...options }, { ...ports, logger });
    return logger.messages("warn");
  }

  it("createDocumentRun with the fix and without arrayLength warns once", async () => {
    const warnings = await warningsOf({ fix: ["array-length-tuples", "array-length-tuples"] });

    expect(warnings).toEqual(['Fix "array-length-tuples" has no effect without arrayLength (--array-length)']);
  });

  it("createDocumentRun with the fix and arrayLength does not warn", async () => {
    expect(await warningsOf(FIXED)).toEqual([]);
  });

  it("createDocumentRun with all and without arrayLength does not warn", async () => {
    expect(await warningsOf({ fix: ["all"] })).toEqual([]);
  });
});
