import fc from "fast-check";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import type { IrPrintable } from "../../src/application/print/print-nodes.js";
import { astToString } from "../../src/lib/ts.js";
import transformComponentsObject from "../../src/transform/components-object.js";
import { componentsArbitrary as components } from "./document-arbitraries.js";
import originalTransformComponentsObject from "./original/components-object.js";
import {
  type ContextInput,
  contextInput,
  createContext,
  RUNS,
  resetLegacyEnumState,
  TIMEOUT_MS,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 6: the ported components transformer must produce exactly what
 * the fork base produced: the `components` type, the `--root-types` aliases (names, conflicts,
 * casing options) and the footer.
 */

/** The new and the original transformer; their option types differ (IR and TypeScript). */
type Transform = (value: never, ctx: never) => readonly (IrPrintable | ts.Node)[];

function run(transform: Transform, value: unknown, input: ContextInput): string {
  resetLegacyEnumState();
  const ctx = createContext(input);
  try {
    const nodes = transform(value as never, ctx as never);
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
