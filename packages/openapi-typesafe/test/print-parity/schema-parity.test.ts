import fc from "fast-check";
import { describe, expect, it } from "vitest";
import transformSchemaObject from "../../src/transform/schema-object.js";
import originalTransformSchemaObject from "./original/schema-object.js";
import {
  type ContextInput,
  contextInput,
  RUNS,
  runLegacy,
  schemaArbitrary,
  TIMEOUT_MS,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 2: the ported schema transformer must produce exactly what the
 * fork base produced, for any schema and any option combination, including the footer
 * declarations (enums, enum value arrays, helpers), user callbacks, and errors.
 */

type Transform = typeof transformSchemaObject;

function run(transform: Transform, schema: unknown, input: ContextInput): string {
  const build = (options: Parameters<Transform>[1]) =>
    transform(schema as never, options, input.isFromAdditionalProperties);
  return runLegacy(build, input, input.path);
}

describe("schema transformer parity with the fork base", () => {
  it(
    "transformSchemaObject matches the original for random schemas and options",
    () => {
      fc.assert(
        fc.property(schemaArbitrary(), contextInput, (schema, input) => {
          expect(run(transformSchemaObject, schema, input)).toBe(
            run(originalTransformSchemaObject, schema, input),
          );
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );
});
