import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { printDocument } from "../../src/generate.js";
import { astToString } from "../../src/lib/ts.js";
import transformSchema from "../../src/transform/index.js";
import type { OpenAPI3 } from "../../src/types.js";
import { documentArbitrary, injectArbitrary } from "./document-arbitraries.js";
import {
  type ContextInput,
  contextInput,
  createContext,
  RUNS,
  resetLegacyEnumState,
  TIMEOUT_MS,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 7: the CLI prints the document with our printer. On every
 * document it must print exactly what the TypeScript printer prints for the same run's nodes.
 */

const DOCUMENT_TIMEOUT_MS = TIMEOUT_MS * 4;

type Print = (schema: OpenAPI3, input: ContextInput, inject: string | undefined) => string;

const printWithTypeScript: Print = (schema, input, inject) =>
  astToString(transformSchema(schema, { ...createContext(input), inject }));

const printWithIr: Print = (schema, input, inject) =>
  printDocument(schema, { ...createContext(input), inject });

function run(print: Print, value: unknown, input: ContextInput, inject?: string): string {
  resetLegacyEnumState();
  try {
    return print(value as OpenAPI3, input, inject);
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

describe("print path parity", () => {
  it(
    "printDocument prints what the TypeScript printer prints",
    () => {
      fc.assert(
        fc.property(documentArbitrary, contextInput, injectArbitrary, (value, input, inject) => {
          expect(run(printWithIr, value, input, inject)).toBe(
            run(printWithTypeScript, value, input, inject),
          );
        }),
        { numRuns: RUNS },
      );
    },
    DOCUMENT_TIMEOUT_MS,
  );
});
