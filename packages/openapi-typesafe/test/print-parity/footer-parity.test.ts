import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseStatements } from "../../src/adapters/type-ast-bridge/ir-declarations-to-typescript.js";
import { createTransformContext } from "../../src/api/transform-context.js";
import type { DocumentFooter } from "../../src/application/transform/transform-context.js";
import { irReference } from "../../src/domain/ir/constructors.js";
import { astToString } from "../../src/index.js";
import { DEFAULT_CTX } from "../test-helpers.js";
import originalFooter from "./original/footer.js";
import {
  hasDuplicateEnumMembers,
  hasRedeclaredConstArrays,
  hasRepeatedParametersIndex,
  hasUnquotedExtractProbe,
  RUNS,
  resetLegacyEnumState,
  TIMEOUT_MS,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 6: the run footer (enum registry, enum naming, helper types)
 * must add exactly the declarations the fork-base footer added, in the same order, and return
 * the same enum names. Names with invalid characters exercise the original's regex state.
 */

const NAMES = ["a-", "b-", "Status", "my status", "1abc", "é", "a+b", "/Pet/status", "-", "$x"];
const name = fc.constantFrom(...NAMES);
// No empty string: task 7.4 names that member `""` on purpose (upstream #2807, enum-naming.test.ts).
const value = fc.oneof(
  fc.constantFrom("a", "b-c", "1.5", "-x", "+", "a+b", "é", "x y", "B"),
  fc.constantFrom(0, 1, -1, 1.5, -2.5, 10),
);
const metadata = fc.record({
  name: fc.constantFrom(undefined, "Named", "bad name", "1st"),
  description: fc.constantFrom(undefined, "", "  trimmed  ", "Line"),
});
const values = fc.array(value, { maxLength: 4 });

const operation = fc.oneof(
  fc.record({
    kind: fc.constant("enum" as const),
    name,
    values,
    metadata: fc.array(metadata, { maxLength: 4 }),
  }),
  fc.record({ kind: fc.constant("enumValues" as const), name, values }),
  fc.record({ kind: fc.constant("withRequired" as const) }),
);
type FooterOperation = typeof operation extends fc.Arbitrary<infer T> ? T : never;

const input = fc.record({
  isDedupingEnums: fc.boolean(),
  predeclared: fc.constantFrom(null, "type ReadonlyArray<T> = T[];", "type WithRequired = 1;"),
  operations: fc.array(operation, { maxLength: 6 }),
});
type FooterInput = typeof input extends fc.Arbitrary<infer T> ? T : never;

function apply(footer: DocumentFooter, step: FooterOperation): string {
  switch (step.kind) {
    case "enum":
      return footer.addEnum(step);
    case "enumValues":
      footer.addEnumValues({ ...step, type: irReference("T") });
      return "";
    case "withRequired":
      footer.requireWithRequired();
      return "";
  }
}

function run(footerOf: (ctx: never) => DocumentFooter, value: FooterInput): string {
  resetLegacyEnumState();
  const injectFooter = value.predeclared ? [...parseStatements(ts, value.predeclared)] : [];
  const ctx = { ...DEFAULT_CTX, dedupeEnums: value.isDedupingEnums, injectFooter };
  const names: string[] = [];
  try {
    for (const step of value.operations) {
      names.push(apply(footerOf(ctx as never), step));
    }
  } catch {
    // The messages differ (the original fails with a TypeError); failing at the same step is parity.
    names.push("error");
  }
  return `${names.join("|")}\n${astToString(ctx.injectFooter)}`;
}

describe("footer parity", () => {
  it(
    "the run footer matches the original footer on random operation sequences",
    () => {
      fc.assert(
        fc.property(input, (value) => {
          const expected = run(originalFooter, value);
          fc.pre(!hasDuplicateEnumMembers(expected) && !hasRedeclaredConstArrays(expected));
          fc.pre(!hasRepeatedParametersIndex(expected));
          fc.pre(!hasUnquotedExtractProbe(expected));
          expect(run((ctx) => createTransformContext(ctx).footer, value)).toBe(expected);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );
});
