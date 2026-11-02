import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { astToString } from "../../src/lib/ts.js";
import transformSchema from "../../src/transform/index.js";
import {
  documentArbitrary as document,
  injectArbitrary as inject,
} from "./document-arbitraries.js";
import originalTransformSchema from "./original/index.js";
import {
  type ContextInput,
  contextInput,
  createContext,
  RUNS,
  resetLegacyEnumState,
  TIMEOUT_MS,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 6: the ported root transformer must produce exactly what the
 * fork base produced: helper types, injected code, the four root types with the `--root-types`
 * aliases, the footer, the `operations` fallback and the `--make-paths-enum` enum.
 */

/** A run transforms a whole document, several times the work of one node per run. */
const DOCUMENT_TIMEOUT_MS = TIMEOUT_MS * 4;

type Transform = typeof transformSchema;

function run(transform: Transform, value: unknown, input: ContextInput, code?: string): string {
  resetLegacyEnumState();
  const ctx = { ...createContext(input), inject: code };
  try {
    return astToString(transform(value as never, ctx));
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

describe("root transformer parity with the fork base", () => {
  it(
    "transformSchema matches the original",
    () => {
      fc.assert(
        fc.property(document, contextInput, inject, (value, input, code) => {
          expect(run(transformSchema, value, input, code)).toBe(
            run(originalTransformSchema, value, input, code),
          );
        }),
        { numRuns: RUNS },
      );
    },
    DOCUMENT_TIMEOUT_MS,
  );
});
