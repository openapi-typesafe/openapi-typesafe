import fc from "fast-check";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import transformSchema from "../../src/api/transform-schema.js";
import type { IrDeclaration } from "../../src/domain/ir/nodes.js";
import { astToString } from "../../src/index.js";
import {
  documentArbitrary as document,
  injectArbitrary as inject,
} from "./document-arbitraries.js";
import originalTransformSchema from "./original/index.js";
import {
  type ContextInput,
  contextInput,
  createContext,
  hasBooleanPathKey,
  hasDuplicateEnumMembers,
  hasRedeclaredConstArrays,
  hasRepeatedEnumDeclarations,
  hasRepeatedOperationKeys,
  hasRepeatedParametersIndex,
  hasRetypedEnumValues,
  hasUnquotedExtractProbe,
  mergesDifferentInputEnums,
  OPTION_KEYS,
  RUNS,
  reachesFixedLegacyBug,
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

/** The new and the original transformer; their option types differ (IR and TypeScript). */
type Transform = (schema: never, ctx: never) => readonly (IrDeclaration | ts.Node)[];

/**
 * Whether the original exports a root alias and an enum under one name. That output does not
 * compile; task 7.4 renames the alias on purpose (upstream #2099, root-type-enum-collisions.test.ts).
 */
function hasRootAliasEnumCollision(output: string): boolean {
  const enums = new Set([...output.matchAll(/^export enum (\S+) \{/gm)].map((match) => match[1]));
  const aliases = [...output.matchAll(/^export type (\S+) = components\['/gm)];
  return aliases.some((match) => enums.has(match[1]));
}

function run(transform: Transform, value: unknown, input: ContextInput, code?: string): string {
  resetLegacyEnumState();
  const ctx = { ...createContext(input), inject: code };
  try {
    return astToString(transform(value as never, ctx as never));
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

/**
 * Counterexamples of earlier runs, checked first on every run. Seed -2008229445: the enum of a path
 * item parameter in a `oneOf` member, whose `--enum-values` type repeats `parameters` inside
 * `Extract`.
 */
const NO_FLAGS = Object.fromEntries(OPTION_KEYS.map((name) => [name, false]));

const EXAMPLES = [
  [
    {
      paths: {
        "/items": {
          parameters: [{ in: "query", schema: { oneOf: [{ properties: { a: { enum: [] } } }] } }],
        },
      },
    },
    {
      flags: { ...NO_FLAGS, enumValues: true },
      callbacks: 0,
      path: "#/components/schemas/Root",
      isFromAdditionalProperties: false,
      hasDiscriminator: false,
      handledRefs: [],
    },
    undefined,
  ],
] as unknown as [unknown, ContextInput, string | undefined][];

describe("root transformer parity with the fork base", () => {
  it(
    "transformSchema matches the original",
    () => {
      fc.assert(
        fc.property(document, contextInput, inject, (value, input, code) => {
          const original = run(originalTransformSchema, value, input, code);
          fc.pre(!hasRootAliasEnumCollision(original));
          fc.pre(!hasDuplicateEnumMembers(original) && !hasRedeclaredConstArrays(original));
          fc.pre(!hasRepeatedEnumDeclarations(original));
          fc.pre(!hasRepeatedOperationKeys(original));
          fc.pre(!hasRepeatedParametersIndex(original));
          fc.pre(!hasUnquotedExtractProbe(original));
          fc.pre(!hasBooleanPathKey(original));
          fc.pre(!reachesFixedLegacyBug(value, input));
          fc.pre(!mergesDifferentInputEnums(value, input));
          const output = run(transformSchema, value, input, code);
          fc.pre(!hasRetypedEnumValues(output));
          expect(output).toBe(original);
        }),
        { numRuns: RUNS, examples: EXAMPLES },
      );
    },
    DOCUMENT_TIMEOUT_MS,
  );
});
