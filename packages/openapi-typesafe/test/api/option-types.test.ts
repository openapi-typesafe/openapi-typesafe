import { createConfig } from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString, OpenAPITypesafeError } from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";

/** Options of the wrong type reject with OPTION_INVALID before anything runs (docs/node.md). */

const document = () => ({ openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {} });

// The options as JavaScript may pass them, without the declared types.
const optionsOf = (options: Record<string, unknown>) => options as GeneratorOptions;

const REDOCLY_EXPECTED =
  "a Redocly 1 config made with createConfig or loadConfig from @redocly/openapi-core 1.26 or later";
const FIX_EXPECTED = 'a list of fix names, such as ["all"]';

// The parts of a Redocly 1 config the loader calls; before 1.26 one method had another name.
const method = () => ({});
const styleguideBefore126 = { extendTypes: method, addProblemToIgnore: method };
const olderStyleguide = { ...styleguideBefore126, getRulesForOasVersion: method };
const styleguideWithoutIgnore = { extendTypes: method, getRulesForSpecVersion: method };

describe("openapiTS option types", () => {
  it.each([
    ["fix", null, FIX_EXPECTED, "null"],
    ["fix", "all", FIX_EXPECTED, "a string"],
    ["fix", { all: true }, FIX_EXPECTED, "an object"],
    [
      "redocly",
      { resolve: { http: {} }, styleguide: olderStyleguide },
      REDOCLY_EXPECTED,
      "a config from @redocly/openapi-core before 1.26",
    ],
    ["redocly", { resolve: { http: {} }, styleguide: styleguideBefore126 }, REDOCLY_EXPECTED, "an object"],
    ["redocly", { resolve: { http: {} }, styleguide: styleguideWithoutIgnore }, REDOCLY_EXPECTED, "an object"],
    ["redocly", { resolve: {}, styleguide: olderStyleguide }, REDOCLY_EXPECTED, "an object"],
    ["inject", 42, "a string", "a number"],
    ["inject", null, "a string", "null"],
    ["enum", "false", "true or false", "a string"],
    ["silent", 1, "true or false", "a number"],
    ["irCallbacks", "yes", "true or false", "a string"],
    ["lint", "false", "true or false", "a string"],
    ["transform", "x", "a function", "a string"],
    ["postTransform", {}, "a function", "an object"],
    ["transformProperty", [], "a function", "a list"],
    ["redocly", { extends: ["recommended"] }, REDOCLY_EXPECTED, "an object"],
    ["redocly", { resolve: {}, styleguide: { extendTypes: () => ({}) } }, REDOCLY_EXPECTED, "an object"],
    ["redocly", { resolve: { http: {} }, styleguide: {} }, REDOCLY_EXPECTED, "an object"],
    ["redocly", { resolve: { http: {} } }, REDOCLY_EXPECTED, "an object"],
    ["redocly", { styleguide: { extendTypes: () => ({}) } }, REDOCLY_EXPECTED, "an object"],
    ["redocly", "redocly.yaml", REDOCLY_EXPECTED, "a string"],
  ])("openapiTS with %s %j rejects with OPTION_INVALID", async (option, value, expected, got) => {
    const run = openapiTS(document(), optionsOf({ silent: true, [option]: value }));

    await expect(run).rejects.toBeInstanceOf(OpenAPITypesafeError);
    await expect(run).rejects.toMatchObject({
      code: "OPTION_INVALID",
      message: `The ${option} option must be ${expected}; got ${got}.`,
      details: { option },
    });
  });

  it.each([
    ["x", "a string"],
    [true, "a boolean"],
    [null, "null"],
    [[], "a list"],
  ])("openapiTS with the options %j rejects with OPTION_INVALID", async (options, got) => {
    const run = openapiTS(document(), options as unknown as GeneratorOptions);

    await expect(run).rejects.toBeInstanceOf(OpenAPITypesafeError);
    await expect(run).rejects.toMatchObject({
      code: "OPTION_INVALID",
      message: `The options must be an object; got ${got}.`,
      details: {},
    });
  });

  it("openapiTS without options generates the types", async () => {
    const types = astToString(await openapiTS(document(), undefined));

    expect(types).toContain("export type paths");
  });

  it("openapiTS with options of the right types generates the types", async () => {
    const redocly = await createConfig({ extends: ["minimal"] });
    const options = {
      inject: "type Injected = 1;",
      enum: false,
      silent: true,
      irCallbacks: true,
      transform: () => undefined,
      redocly,
    } as const;

    const types = astToString(await openapiTS(document(), options));

    expect(types).toContain("type Injected = 1;");
  });
});
