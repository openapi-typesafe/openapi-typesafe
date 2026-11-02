import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `$defs` is a schema keyword, not data. Values of the generated types must not need a `$defs`
 * key, and refs into a nested or root `$defs` must resolve to the subschema type, not `never`
 * (research/legacy-bugs.md, items 17 and 18; upstream #2664).
 */

const DEFS_FIXTURE = new URL("../fixtures/jsonschema-defs.yaml", import.meta.url);

async function generatedWith(usage: string): Promise<string[]> {
  const output = astToString(await openapiTS(DEFS_FIXTURE));
  return typeErrorsOf(`${output}\n${usage}`);
}

describe("$defs types", () => {
  it("an object value without a $defs key matches the schema type", async () => {
    const usage = 'const value: components["schemas"]["Object"] = { nestedDef: true };';

    expect(await generatedWith(usage)).toEqual([]);
  });

  it("a ref into a nested $defs resolves to the subschema type", async () => {
    const usage = [
      'type Nested = NonNullable<components["schemas"]["Object"]["nestedDef"]>;',
      "const isTrue: Nested = true;",
      "// @ts-expect-error -- a string is not the boolean subschema",
      'const isWrong: Nested = "yes";',
    ].join("\n");

    expect(await generatedWith(usage)).toEqual([]);
  });

  it("a ref into the root $defs resolves to the subschema type, not never", async () => {
    const usage = [
      'type Root = NonNullable<components["schemas"]["Object"]["rootDef"]>;',
      'const text: Root = "a";',
      'const items: components["schemas"]["ArrayOfDefs"] = ["a", "b"];',
    ].join("\n");

    expect(await generatedWith(usage)).toEqual([]);
  });
});
