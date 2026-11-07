import { createConfig } from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import { astToString, type GlobalContext, transformSchemaObject } from "../../src/index.js";

/**
 * A context built by hand with exactly the fields of openapi-typescript 7.13's `GlobalContext`,
 * as upstream's own tests and users who call the exported transformers outside a run build it.
 * The fields openapi-typesafe added are optional, so this literal compiles (no TS2739) and the
 * transformers use their defaults.
 */
const UPSTREAM_SHAPED_CONTEXT: GlobalContext = {
  additionalProperties: false,
  alphabetize: false,
  arrayLength: false,
  defaultNonNullable: true,
  discriminators: { objects: {}, refsHandled: [] },
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
  postTransform: undefined,
  propertiesRequiredByDefault: false,
  rootTypes: false,
  rootTypesNoSchemaPrefix: false,
  rootTypesKeepCasing: false,
  redoc: await createConfig({}, { extends: ["minimal"] }),
  silent: true,
  transform: undefined,
  transformProperty: undefined,
  resolve: () => undefined,
  makePathsEnum: false,
  generatePathParams: false,
  readWriteMarkers: false,
};

describe("GlobalContext", () => {
  it("transformSchemaObject with an upstream-shaped context uses the added defaults", () => {
    const schema = { type: "string", format: "binary" } as const;

    const type = transformSchemaObject(schema, { path: "#/test", ctx: UPSTREAM_SHAPED_CONTEXT });

    expect(astToString(type).trim()).toBe("string");
  });
});
