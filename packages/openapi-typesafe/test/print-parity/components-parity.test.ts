import fc from "fast-check";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import { astToString } from "../../src/lib/ts.js";
import transformComponentsObject from "../../src/transform/components-object.js";
import originalTransformComponentsObject from "./original/components-object.js";
import {
  type ContextInput,
  contentArbitrary,
  contextInput,
  createContext,
  headerArbitrary,
  RUNS,
  resetLegacyEnumState,
  schemaArbitrary,
  TIMEOUT_MS,
  text,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 6: the ported components transformer must produce exactly what
 * the fork base produced: the `components` type, the `--root-types` aliases (names, conflicts,
 * casing options) and the footer.
 */

const NAMES = ["Pet", "pet", "pet-store", "Pet_2", "1", "a b", "PetStore", "pet_store"] as const;
const name = fc.constantFrom(...NAMES);
const schema = schemaArbitrary();
const components = fc.record(
  {
    schemas: fc.dictionary(name, schema, { maxKeys: 4 }),
    responses: fc.dictionary(name, fc.record({ content: contentArbitrary, description: text }), {
      maxKeys: 2,
    }),
    parameters: fc.dictionary(
      name,
      fc.record({ name: fc.constant("q"), in: fc.constant("query"), schema }),
      {
        maxKeys: 2,
      },
    ),
    requestBodies: fc.dictionary(name, fc.record({ content: contentArbitrary }), { maxKeys: 2 }),
    headers: fc.dictionary(name, headerArbitrary, { maxKeys: 2 }),
    pathItems: fc.dictionary(name, fc.constant({}), { maxKeys: 1 }),
    examples: fc.constant({ Ignored: {} }),
  },
  { requiredKeys: [] },
);

type Transform = typeof transformComponentsObject;

function run(transform: Transform, value: unknown, input: ContextInput): string {
  resetLegacyEnumState();
  const ctx = createContext(input);
  try {
    const nodes = transform(value as never, ctx) as ts.Node[];
    return astToString([...nodes, ...ctx.injectFooter]);
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

describe("components transformer parity with the fork base", () => {
  it(
    "transformComponentsObject matches the original",
    () => {
      fc.assert(
        fc.property(components, contextInput, (value, input) => {
          expect(run(transformComponentsObject, value, input)).toBe(
            run(originalTransformComponentsObject, value, input),
          );
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );
});
