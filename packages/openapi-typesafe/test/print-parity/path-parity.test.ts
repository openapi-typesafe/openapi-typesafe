import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { astToString } from "../../src/lib/ts.js";
import transformOperationObject, {
  injectOperationObject,
} from "../../src/transform/operation-object.js";
import transformPathItemObject from "../../src/transform/path-item-object.js";
import makeApiPathsEnum from "../../src/transform/paths-enum.js";
import transformPathsObject from "../../src/transform/paths-object.js";
import transformWebhooksObject from "../../src/transform/webhooks-object.js";
import type { TransformNodeOptions } from "../../src/types.js";
import originalTransformOperationObject, {
  injectOperationObject as originalInjectOperationObject,
} from "./original/operation-object.js";
import originalTransformPathItemObject from "./original/path-item-object.js";
import originalMakeApiPathsEnum from "./original/paths-enum.js";
import originalTransformPathsObject from "./original/paths-object.js";
import originalTransformWebhooksObject from "./original/webhooks-object.js";
import {
  type ContextInput,
  contentArbitrary,
  contextInput,
  headerArbitrary,
  key,
  RUNS,
  resetLegacyEnumState,
  runLegacy,
  schemaArbitrary,
  TIMEOUT_MS,
  text,
} from "./parity-arbitraries.js";

/**
 * ENGINEERING_PLAN Phase 5, step 5: the ported operation, path item, paths, webhooks and paths
 * enum transformers must produce exactly what the fork base produced, including the `operations`
 * interface and other footer declarations, debug-free output, and errors.
 */

const schema = schemaArbitrary();
const parameter = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record(
      {
        name: fc.oneof(key, fc.constantFrom("id", "count", "flag")),
        in: fc.constantFrom("query", "path", "header"),
        required: fc.boolean(),
        deprecated: fc.boolean(),
        schema: fc.oneof(
          schema,
          fc.record({ type: fc.constantFrom("integer", "boolean", "number") }),
        ),
        description: text,
      },
      { requiredKeys: ["in"] },
    ),
  },
  fc.record({
    $ref: fc.constantFrom(
      "#/components/parameters/Id",
      "#/components/parameters/Count",
      "#/components/parameters/Missing",
    ),
  }),
);
const response = fc.record(
  {
    headers: fc.dictionary(key, headerArbitrary, { maxKeys: 2 }),
    content: contentArbitrary,
    description: text,
  },
  { requiredKeys: [] },
);
const operation = fc.record(
  {
    operationId: fc.constantFrom("listItems", "a#b", "", "getNew"),
    deprecated: fc.boolean(),
    description: text,
    parameters: fc.array(parameter, { maxLength: 3 }),
    requestBody: fc.oneof(
      fc.record(
        { required: fc.boolean(), content: contentArbitrary, description: text },
        { requiredKeys: [] },
      ),
      fc.record({
        $ref: fc.constantFrom(
          "#/components/requestBodies/Body",
          "#/components/requestBodies/Optional",
        ),
      }),
    ),
    responses: fc.dictionary(fc.constantFrom("200", "default"), response, { maxKeys: 2 }),
  },
  { requiredKeys: [] },
);
const operationOrReference = fc.oneof(
  { weight: 4, arbitrary: operation },
  fc.record({ $ref: fc.constantFrom("#/paths/~1old/get", "#/paths/~1new/get") }),
);
const pathItem = fc.record(
  {
    parameters: fc.array(parameter, { maxLength: 3 }),
    get: operationOrReference,
    post: operationOrReference,
    trace: operationOrReference,
    description: text,
  },
  { requiredKeys: [] },
);
const paths = fc.dictionary(
  fc.constantFrom("/items", "/items/{id}", "/a/{count}/{flag}/{count}", "/b/{open", "/c/{id}`x"),
  fc.oneof(
    { weight: 6, arbitrary: pathItem },
    fc.record({ $ref: fc.constant("#/components/pathItems/P") }),
    fc.constantFrom(null, "text"),
  ),
  { maxKeys: 3 },
);
const webhooks = fc.dictionary(
  key,
  fc.oneof({ weight: 4, arbitrary: pathItem }, fc.constant(null)),
  {
    maxKeys: 2,
  },
);

type Build = (options: TransformNodeOptions) => ts.TypeNode;

function expectSameOutput(build: Build, original: Build, input: ContextInput): void {
  expect(runLegacy(build, input, input.path)).toBe(runLegacy(original, input, input.path));
}

function property<T>(arbitrary: fc.Arbitrary<T>, check: (value: T, input: ContextInput) => void) {
  fc.assert(fc.property(arbitrary, contextInput, check), { numRuns: RUNS });
}

function elementsType(transform: typeof transformOperationObject, value: unknown): Build {
  return (options) => ts.factory.createTypeLiteralNode(transform(value as never, options));
}

function injected(inject: typeof injectOperationObject, value: unknown): Build {
  return (options) => {
    inject("op", value as never, options);
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
  };
}

function printEnum(make: typeof makeApiPathsEnum, value: unknown): string {
  resetLegacyEnumState();
  try {
    return astToString([make(value as never)]);
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

describe("path transformer parity with the fork base", () => {
  it(
    "transformOperationObject matches the original",
    () =>
      property(operation, (value, input) =>
        expectSameOutput(
          elementsType(transformOperationObject, value),
          elementsType(originalTransformOperationObject, value),
          input,
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
          (options) => originalTransformPathItemObject(value as never, options),
          input,
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
          (options) => originalTransformPathsObject(value as never, options.ctx),
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
          (options) => originalTransformWebhooksObject(value as never, options.ctx),
          input,
        ),
      ),
    TIMEOUT_MS,
  );

  it(
    "makeApiPathsEnum matches the original",
    () =>
      property(paths, (value) => {
        expect(printEnum(makeApiPathsEnum, value)).toBe(printEnum(originalMakeApiPathsEnum, value));
      }),
    TIMEOUT_MS,
  );
});
