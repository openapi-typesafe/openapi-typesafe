import openapiTS, { astToString, type OpenAPITypesafeError } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** Shared inputs and checks of the defensive tests (ENGINEERING_PLAN 8.5). */

const INFO = { title: "Defensive", version: "1.0" };

/** An OpenAPI 3.1 document with the given component schemas and paths. */
export function documentWith(
  schemas: Readonly<Record<string, unknown>>,
  paths: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return { openapi: "3.1.0", info: INFO, paths, components: { schemas } };
}

/** Generate and print a document; the output must compile under strict TypeScript. */
export async function generateCompiling(
  source: unknown,
  options: Parameters<typeof openapiTS>[1] = {},
): Promise<string> {
  const output = astToString(await openapiTS(source as never, { silent: true, ...options }));
  expect(typeErrorsOf(output)).toEqual([]);
  return output;
}

/** The typed error a generation fails with. */
export async function generationFailure(source: unknown): Promise<OpenAPITypesafeError> {
  try {
    astToString(await openapiTS(source as never, { silent: true }));
  } catch (error) {
    return error as OpenAPITypesafeError;
  }
  throw new Error("The generation should have failed");
}

/** A schema with `depth` objects nested through one property each. */
export function nestedObjects(depth: number): Record<string, unknown> {
  let schema: Record<string, unknown> = { type: "string" };
  for (let level = 0; level < depth; level++) {
    schema = { type: "object", properties: { next: schema }, required: ["next"] };
  }
  return schema;
}
