import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toStatements } from "../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import { printWithTypeScript } from "../../src/adapters/type-ast-bridge/print-typescript.js";
import { printNodes } from "../../src/application/print/print-nodes.js";
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
 * ENGINEERING_PLAN 6.1 and 6.2: `openapiTS` returns IR declarations, printed by our printer. On
 * every document they must print exactly what the TypeScript printer prints for the same
 * declarations converted by the bridge.
 */

const DOCUMENT_TIMEOUT_MS = TIMEOUT_MS * 4;

type Print = (schema: OpenAPI3, input: ContextInput, inject: string | undefined) => string;

const printNodesWithTypeScript: Print = (schema, input, inject) =>
  printWithTypeScript(
    ts,
    transformSchema(schema, { ...createContext(input), inject }).flatMap((node) =>
      toStatements(ts, node),
    ),
  );

const printWithIr: Print = (schema, input, inject) =>
  printNodes(transformSchema(schema, { ...createContext(input), inject }));

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
    "the IR declarations print what the TypeScript printer prints",
    () => {
      fc.assert(
        fc.property(documentArbitrary, contextInput, injectArbitrary, (value, input, inject) => {
          expect(run(printWithIr, value, input, inject)).toBe(
            run(printNodesWithTypeScript, value, input, inject),
          );
        }),
        { numRuns: RUNS },
      );
    },
    DOCUMENT_TIMEOUT_MS,
  );
});
