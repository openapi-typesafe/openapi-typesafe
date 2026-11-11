import { describe, expect, it } from "vitest";
import { defaultGeneratorPorts, generateDeclarations } from "../../src/api/openapi-ts.js";
import { astToString } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` with `--path-params-as-types`: the location check reads the templated path the
 * array's location names, whatever the order of the paths.
 */

const SORT = { name: "sort", in: "query", schema: { type: "string", enum: ["asc", "desc"] } };

function operation(type: string, withSort: boolean) {
  const id = { name: "id", in: "path", required: true, schema: { type } };
  return {
    get: { parameters: withSort ? [id, SORT] : [id], responses: { 200: { description: "ok" } } },
  };
}

async function run(paths: Record<string, unknown>) {
  const document = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths };
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  const declarations = await generateDeclarations(
    JSON.stringify(document),
    { silent: true, enumValues: true, pathParamsAsTypes: true },
    { ...ports, logger },
  );
  return { output: astToString(declarations), warnings: logger.messages("warn") };
}

const ORDERS_ARRAY = "export const pathsOrdersIdGetParametersQuerySortValues: ReadonlyArray<";

describe("--enum-values location check in templated paths", () => {
  it("generateDeclarations types the array by the template after another number path", async () => {
    const { output, warnings } = await run({
      "/users/{id}": operation("integer", false),
      "/orders/{id}": operation("integer", true),
    });

    expect(warnings).toEqual([]);
    expect(output).toContain(`${ORDERS_ARRAY}FlattenedDeepRequired<paths>[\`/orders/\${number}\`]`);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations types the array by the template before another number path", async () => {
    const { output, warnings } = await run({
      "/orders/{id}": operation("integer", true),
      "/users/{id}": operation("integer", false),
    });

    expect(warnings).toEqual([]);
    expect(output).toContain(`${ORDERS_ARRAY}FlattenedDeepRequired<paths>[\`/orders/\${number}\`]`);
  });

  it("generateDeclarations reports a contradiction in a templated path", async () => {
    const both = {
      allOf: [
        { type: "string", enum: ["asc"] },
        { type: "string", enum: ["desc"] },
      ],
    };
    const id = { name: "id", in: "path", required: true, schema: { type: "integer" } };
    const order = { name: "order", in: "query", schema: both };
    const { warnings } = await run({
      "/users/{id}": operation("integer", false),
      "/orders/{id}": {
        get: { parameters: [id, order], responses: { 200: { description: "ok" } } },
      },
    });

    expect(warnings.join("\n")).toContain("ENUM_VALUES_EXCLUDED");
  });

  it("generateDeclarations types the array by the URL after another string path", async () => {
    const { output, warnings } = await run({
      "/users/{id}": operation("string", false),
      "/orders/{id}": operation("string", true),
    });

    expect(warnings).toEqual([]);
    expect(output).toContain(`${ORDERS_ARRAY}FlattenedDeepRequired<paths>["/orders/{id}"]`);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
