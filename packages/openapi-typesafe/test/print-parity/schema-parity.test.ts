import fc from "fast-check";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import type { IrType } from "../../src/domain/ir/nodes.js";
import transformSchemaObject from "../../src/transform/schema-object.js";
import type { TransformNodeOptions } from "../../src/types.js";
import originalTransformSchemaObject from "./original/schema-object.js";
import {
  type ContextInput,
  contextInput,
  hasDuplicateEnumMembers,
  hasRedeclaredConstArrays,
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

/** The new and the original transformer; their option types differ (IR and TypeScript). */
type Transform = (
  schema: never,
  options: never,
  isFromAdditionalProperties: boolean,
) => IrType | ts.TypeNode;

function run(transform: Transform, schema: unknown, input: ContextInput): string {
  const build = (options: TransformNodeOptions) =>
    transform(schema as never, options as never, input.isFromAdditionalProperties);
  return runLegacy(build, input, input.path);
}

describe("schema transformer parity with the fork base", () => {
  it(
    "transformSchemaObject matches the original for random schemas and options",
    () => {
      fc.assert(
        fc.property(schemaArbitrary(), contextInput, (schema, input) => {
          const expected = run(originalTransformSchemaObject, schema, input);
          fc.pre(!hasDuplicateEnumMembers(expected) && !hasRedeclaredConstArrays(expected));
          expect(run(transformSchemaObject, schema, input)).toBe(expected);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );
});
