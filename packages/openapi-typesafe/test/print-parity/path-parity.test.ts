import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { IrEnumDeclaration, IrMember, IrType } from "../../src/domain/ir/nodes.js";
import { astToString } from "../../src/index.js";
import transformOperationObject, {
  injectOperationObject,
} from "../../src/transform/operation-object.js";
import transformPathItemObject from "../../src/transform/path-item-object.js";
import makeApiPathsEnum from "../../src/transform/paths-enum.js";
import transformPathsObject from "../../src/transform/paths-object.js";
import transformWebhooksObject from "../../src/transform/webhooks-object.js";
import type { TransformNodeOptions } from "../../src/types.js";
import {
  operationArbitrary as operation,
  pathItemArbitrary as pathItem,
  pathsArbitrary as paths,
  webhooksArbitrary as webhooks,
} from "./document-arbitraries.js";
import originalTransformOperationObject, {
  injectOperationObject as originalInjectOperationObject,
} from "./original/operation-object.js";
import originalTransformPathItemObject from "./original/path-item-object.js";
import originalMakeApiPathsEnum from "./original/paths-enum.js";
import originalTransformPathsObject from "./original/paths-object.js";
import originalTransformWebhooksObject from "./original/webhooks-object.js";
import {
  type ContextInput,
  contextInput,
  hasBooleanPathKey,
  hasDuplicateEnumMembers,
  hasRedeclaredConstArrays,
  hasRepeatedEnumDeclarations,
  hasRepeatedOperationKeys,
  hasRepeatedParametersIndex,
  hasUnquotedExtractProbe,
  mergesDifferentInputEnums,
  objectOf,
  RUNS,
  resetLegacyEnumState,
  runLegacy,
  TIMEOUT_MS,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 5: the ported operation, path item, paths, webhooks and paths
 * enum transformers must produce exactly what the fork base produced, including the `operations`
 * interface and other footer declarations, debug-free output, and errors.
 */

type Build = (options: TransformNodeOptions) => IrType | ts.TypeNode;

function expectSameOutput(
  build: Build,
  original: Build,
  input: ContextInput,
  path: string = input.path,
): void {
  const expected = runLegacy(original, input, path);
  fc.pre(!hasDuplicateEnumMembers(expected) && !hasRedeclaredConstArrays(expected));
  fc.pre(!hasRepeatedEnumDeclarations(expected));
  fc.pre(!hasRepeatedOperationKeys(expected));
  fc.pre(!hasRepeatedParametersIndex(expected));
  fc.pre(!hasUnquotedExtractProbe(expected));
  fc.pre(!hasBooleanPathKey(expected));
  expect(runLegacy(build, input, path)).toBe(expected);
}

function property<T>(arbitrary: fc.Arbitrary<T>, check: (value: T, input: ContextInput) => void) {
  const checkKept = (value: T, input: ContextInput) => {
    fc.pre(!mergesDifferentInputEnums(value, input));
    check(value, input);
  };
  fc.assert(fc.property(arbitrary, contextInput, checkKept), { numRuns: RUNS });
}

/** The new and the original transformer; their option types differ (IR and TypeScript). */
type Elements = (value: never, options: never) => IrMember[] | ts.TypeElement[];

function elementsType(transform: Elements, value: unknown): Build {
  return (options) => objectOf(transform(value as never, options as never));
}

function injected(
  inject: (id: string, value: never, options: never) => void,
  value: unknown,
): Build {
  return (options) => {
    inject("op", value as never, options as never);
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
  };
}

function printEnum(make: (value: never) => IrEnumDeclaration | ts.Node, value: unknown): string {
  resetLegacyEnumState();
  try {
    return astToString([make(value as never)]);
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

/**
 * Operations and path items sit at these pointers in a document. The default of an input property
 * makes it no required one, and the generator reads the input places by the document's structure
 * (input-location.test.ts), so these nodes are not typed at a component schema's pointer.
 */
const OPERATION_PATH = "#/paths/~1items/get";
const PATH_ITEM_PATH = "#/paths/~1items";

describe("path transformer parity with the fork base", () => {
  it(
    "transformOperationObject matches the original",
    () =>
      property(operation, (value, input) =>
        expectSameOutput(
          elementsType(transformOperationObject, value),
          elementsType(originalTransformOperationObject, value),
          input,
          OPERATION_PATH,
        ),
      ),
    TIMEOUT_MS,
  );

  it(
    "injectOperationObject matches the original",
    () =>
      property(operation, (value, input) =>
        expectSameOutput(
          injected(injectOperationObject, value),
          injected(originalInjectOperationObject, value),
          input,
          OPERATION_PATH,
        ),
      ),
    TIMEOUT_MS,
  );

  it(
    "transformPathItemObject matches the original",
    () =>
      property(pathItem, (value, input) =>
        expectSameOutput(
          (options) => transformPathItemObject(value as never, options),
          (options) => originalTransformPathItemObject(value as never, options as never),
          input,
          PATH_ITEM_PATH,
        ),
      ),
    TIMEOUT_MS,
  );

  it(
    "transformPathsObject matches the original",
    () =>
      property(paths, (value, input) =>
        expectSameOutput(
          (options) => transformPathsObject(value as never, options.ctx),
          (options) => originalTransformPathsObject(value as never, options.ctx as never),
          input,
        ),
      ),
    TIMEOUT_MS,
  );

  it(
    "transformWebhooksObject matches the original",
    () =>
      property(webhooks, (value, input) =>
        expectSameOutput(
          (options) => transformWebhooksObject(value as never, options.ctx),
          (options) => originalTransformWebhooksObject(value as never, options.ctx as never),
          input,
        ),
      ),
    TIMEOUT_MS,
  );

  it(
    "makeApiPathsEnum matches the original",
    () =>
      property(paths, (value) => {
        const original = printEnum(originalMakeApiPathsEnum, value);
        fc.pre(!hasDuplicateEnumMembers(original) && !hasRedeclaredConstArrays(original));
        fc.pre(!hasRepeatedEnumDeclarations(original));
        fc.pre(!hasRepeatedOperationKeys(original));
        fc.pre(!hasRepeatedParametersIndex(original));
        fc.pre(!hasUnquotedExtractProbe(original));
        expect(printEnum(makeApiPathsEnum, value)).toBe(original);
      }),
    TIMEOUT_MS,
  );
});
