import { createConfig } from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString, OpenAPITypesafeError } from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";

/** Options of the wrong type reject with OPTION_INVALID before anything runs (docs/node.md). */

const document = () => ({ openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {} });

// The options as JavaScript may pass them, without the declared types.
const optionsOf = (options: Record<string, unknown>) => options as GeneratorOptions;

const REDOCLY_EXPECTED = "a Redocly 1 config made with createConfig or loadConfig from @redocly/openapi-core";

describe("openapiTS option types", () => {
  it.each([
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
