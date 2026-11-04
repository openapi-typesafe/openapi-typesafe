import fc from "fast-check";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import type { IrType } from "../../src/domain/ir/nodes.js";
import transformRequestBodyObject from "../../src/transform/request-body-object.js";
import transformResponseObject from "../../src/transform/response-object.js";
import transformResponsesObject from "../../src/transform/responses-object.js";
import originalTransformRequestBodyObject from "./original/request-body-object.js";
import originalTransformResponseObject from "./original/response-object.js";
import originalTransformResponsesObject from "./original/responses-object.js";
import {
  type ContextInput,
  contentArbitrary,
  contextInput,
  hasDuplicateEnumMembers,
  headerArbitrary,
  key,
  REFS,
  RUNS,
  runLegacy,
  TIMEOUT_MS,
  text,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 4: the ported request body, response and responses transformers
 * must produce exactly what the fork base produced, including footer declarations and errors.
 */

const reference = fc.record({ $ref: fc.constantFrom(...REFS) });
const requestBody = fc.record(
  { content: contentArbitrary, description: text },
  { requiredKeys: [] },
);
const response = fc.record(
  {
    headers: fc.dictionary(key, fc.oneof({ weight: 3, arbitrary: headerArbitrary }, reference), {
      maxKeys: 3,
    }),
    content: contentArbitrary,
    description: text,
    deprecated: fc.boolean(),
  },
  { requiredKeys: [] },
);
const responses = fc.dictionary(
  fc.constantFrom("200", "404", "default", "2XX"),
  fc.oneof({ weight: 3, arbitrary: response }, reference),
  { maxKeys: 3 },
);

/** The new and the original transformer; their option types differ (IR and TypeScript). */
type Transform = (value: never, options: never) => IrType | ts.TypeNode;

function checkParity<T>(
  arbitrary: fc.Arbitrary<T>,
  transform: Transform,
  original: Transform,
): void {
  fc.assert(
    fc.property(arbitrary, contextInput, (value: T, input: ContextInput) => {
      const run = (build: Transform) =>
        runLegacy((options) => build(value as never, options as never), input, input.path);
      const expected = run(original);
      fc.pre(!hasDuplicateEnumMembers(expected));
      expect(run(transform)).toBe(expected);
    }),
    { numRuns: RUNS },
  );
}

describe("response transformer parity with the fork base", () => {
  it(
    "transformRequestBodyObject matches the original",
    () => checkParity(requestBody, transformRequestBodyObject, originalTransformRequestBodyObject),
    TIMEOUT_MS,
  );

  it(
    "transformResponseObject matches the original",
    () => checkParity(response, transformResponseObject, originalTransformResponseObject),
    TIMEOUT_MS,
  );

  it(
    "transformResponsesObject matches the original",
    () => checkParity(responses, transformResponsesObject, originalTransformResponsesObject),
    TIMEOUT_MS,
  );
});
