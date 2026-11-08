import { createConfig } from "@redocly/openapi-core";
import { resolveRef } from "../src/api/legacy-utils.js";
import { defaultGeneratorPorts, generateDeclarations } from "../src/api/openapi-ts.js";
import type { RunContext } from "../src/api/run-context.js";
import type { IrDeclaration } from "../src/domain/ir/nodes.js";
import type { GeneratorOptions, GlobalContext, SchemaSource, TransformNodeOptions } from "../src/types.js";
import { RecordingDeprecations } from "./fakes/recording-deprecations.js";

/**
 * Default options for all transform* functions. Deprecated callback forms are recorded, not
 * printed: the tests of the deprecations themselves are in `api/deprecations.test.ts`.
 */
export const DEFAULT_CTX: RunContext = {
  additionalProperties: false,
  alphabetize: false,
  arrayLength: false,
  binaryAsBlob: false,
  defaultNonNullable: true,
  discriminators: {
    objects: {},
    refsHandled: [],
  },
  emptyObjectsUnknown: false,
  enum: false,
  enumValues: false,
  conditionalEnums: false,
  dedupeEnums: false,
  excludeDeprecated: false,
  exportType: false,
  immutable: false,
  injectFooter: [],
  pathParamsAsTypes: false,
  irCallbacks: false,
  postTransform: undefined,
  propertiesRequiredByDefault: false,
  rootTypes: false,
  rootTypesNoSchemaPrefix: false,
  rootTypesKeepCasing: false,
  redoc: await createConfig({}, { extends: ["minimal"] }),
  resolve($ref) {
    return resolveRef({}, $ref, { silent: false });
  },
  silent: true,
  transform: undefined,
  transformProperty: undefined,
  makePathsEnum: false,
  generatePathParams: false,
  readWriteMarkers: false,
  deprecations: new RecordingDeprecations(),
};

/**
 * `openapiTS` with the default ports, except that deprecated callback forms are recorded in
 * `deprecations` instead of printed as Node.js warnings.
 */
export async function generateRecordingDeprecations(
  source: SchemaSource,
  options: GeneratorOptions = {},
  deprecations = new RecordingDeprecations(),
): Promise<IrDeclaration[]> {
  const ports = { ...(await defaultGeneratorPorts(options)), deprecations };
  return generateDeclarations(source, options, ports);
}

/**
 * A `resolve` callback for a test: `find` returns the document node of a `$ref`, or `undefined`.
 * The generic `resolve` returns the type its caller asks for, so the node is cast once here.
 */
export function fixtureResolver(find: ($ref: string) => unknown): GlobalContext["resolve"] {
  return <T>($ref: string) => find($ref) as T | undefined;
}

/**
 * The `given` value of a fixture. Fixtures include loose and invalid schemas on purpose, and
 * `any` lets them reach the function under test without a cast in every suite.
 */
// biome-ignore lint/suspicious/noExplicitAny: loose and invalid fixtures must reach the code under test
export type LooseFixture = any;

/** Generic test case */
export type TestCase<T = LooseFixture, O = TransformNodeOptions> = [
  string,
  {
    /**
     * The OpenAPI schema; see `LooseFixture`.
     */
    given: T;
    /**
     * The expected TypeScript output. Be mindful of indentation and
     * parentheses!
     */
    want: string | URL;
    /**
     * Transform options.
     */
    options?: O;
    /**
     * Options for Vitest
     */
    ci?: { timeout?: number; skipIf?: boolean };
  },
];
