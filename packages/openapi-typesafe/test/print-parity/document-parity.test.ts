import fc from "fast-check";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import type { IrMember, IrType } from "../../src/domain/ir/nodes.js";
import transformHeaderObject from "../../src/transform/header-object.js";
import transformMediaTypeObject from "../../src/transform/media-type-object.js";
import transformParameterObject from "../../src/transform/parameter-object.js";
import { transformParametersArray } from "../../src/transform/parameters-array.js";
import type { TransformNodeOptions } from "../../src/types.js";
import originalTransformHeaderObject from "./original/header-object.js";
import originalTransformMediaTypeObject from "./original/media-type-object.js";
import originalTransformParameterObject from "./original/parameter-object.js";
import { transformParametersArray as originalTransformParametersArray } from "./original/parameters-array.js";
import {
  type ContextInput,
  contextInput,
  hasDuplicateEnumMembers,
  hasRedeclaredConstArrays,
  hasRepeatedEnumDeclarations,
  hasRepeatedOperationKeys,
  hasRepeatedParametersIndex,
  hasUnquotedExtractProbe,
  headerArbitrary,
  key,
  mediaTypeArbitrary,
  mergesDifferentInputEnums,
  objectOf,
  RUNS,
  runLegacy,
  schemaArbitrary,
  TIMEOUT_MS,
  text,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 3: the ported media type, header and parameter transformers must
 * produce exactly what the fork base produced, including footer declarations and errors.
 */

const PARAMETER_REFS = [
  "#/components/parameters/Id",
  "#/components/parameters/Old",
  "#/components/parameters/Alias",
  "#/components/parameters/Missing",
] as const;
const TEMPLATE_PATHS = [undefined, "/items/{id}", "/a/{x}/{y}/{x}", "#/paths/~1items~1{id}/get"];

const schema = schemaArbitrary();
const parameter = fc.record(
  {
    name: fc.oneof({ weight: 8, arbitrary: key }, fc.constant(undefined)),
    in: fc.constantFrom("query", "header", "path", "cookie", "body"),
    required: fc.boolean(),
    deprecated: fc.boolean(),
    schema,
    description: text,
  },
  { requiredKeys: ["in"] },
);
const parameterOrReference = fc.oneof(
  { weight: 4, arbitrary: parameter },
  fc.record({ $ref: fc.constantFrom(...PARAMETER_REFS) }),
);
const parameters = fc.array(parameterOrReference, { maxLength: 5 });

type Build = (options: TransformNodeOptions) => IrType | ts.TypeNode;

/** `path` is explicit because the parameters test also covers a missing path. */
function expectSameOutput(
  build: Build,
  original: Build,
  input: ContextInput,
  path: string | undefined,
): void {
  const expected = runLegacy(original, input, path);
  fc.pre(!hasDuplicateEnumMembers(expected) && !hasRedeclaredConstArrays(expected));
  fc.pre(!hasRepeatedEnumDeclarations(expected));
  fc.pre(!hasRepeatedOperationKeys(expected));
  fc.pre(!hasRepeatedParametersIndex(expected));
  fc.pre(!hasUnquotedExtractProbe(expected));
  expect(runLegacy(build, input, path)).toBe(expected);
}

/** A parameters array as a type literal, so the property list prints like any type. */
function parametersType(
  transform: (value: never, options: never) => IrMember[] | ts.TypeElement[],
  value: unknown[],
): Build {
  return (options) => objectOf(transform(value as never, options as never));
}

describe("document transformer parity with the fork base", () => {
  it(
    "transformMediaTypeObject matches the original",
    () => {
      fc.assert(
        fc.property(mediaTypeArbitrary, contextInput, (value, input) => {
          fc.pre(!mergesDifferentInputEnums(value, input));
          expectSameOutput(
            (options) => transformMediaTypeObject(value as never, options),
            (options) => originalTransformMediaTypeObject(value as never, options as never),
            input,
            input.path,
          );
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it(
    "transformHeaderObject matches the original",
    () => {
      fc.assert(
        fc.property(headerArbitrary, contextInput, (value, input) => {
          fc.pre(!mergesDifferentInputEnums(value, input));
          expectSameOutput(
            (options) => transformHeaderObject(value as never, options),
            (options) => originalTransformHeaderObject(value as never, options as never),
            input,
            input.path,
          );
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it(
    "transformParameterObject matches the original",
    () => {
      fc.assert(
        fc.property(parameter, contextInput, (value, input) => {
          fc.pre(!mergesDifferentInputEnums(value, input));
          expectSameOutput(
            (options) => transformParameterObject(value as never, options),
            (options) => originalTransformParameterObject(value as never, options as never),
            input,
            input.path,
          );
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it(
    "transformParametersArray matches the original",
    () => {
      const path = fc.constantFrom(...TEMPLATE_PATHS);
      fc.assert(
        fc.property(parameters, contextInput, path, (value, input, templatePath) => {
          fc.pre(!mergesDifferentInputEnums(value, input));
          expectSameOutput(
            parametersType(transformParametersArray, value),
            parametersType(originalTransformParametersArray, value),
            input,
            templatePath,
          );
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );
});
