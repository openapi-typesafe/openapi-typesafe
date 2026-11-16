import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import transformSchema from "../../src/api/transform-schema.js";
import openapiTS, {
  astToString,
  type GeneratorOptions,
  NULL,
  NUMBER,
  type OpenAPI3,
  type OpenAPITSIrOptions,
  type OpenAPITSOptions,
  tsUnion,
} from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { RecordingDeprecations } from "../fakes/recording-deprecations.js";

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Item: {
        type: "object",
        required: ["updatedAt"],
        properties: {
          updatedAt: { type: "string", format: "date-time" },
          name: { type: "string" },
        },
      },
    },
  },
};

async function itemOf(options: Omit<OpenAPITSIrOptions, "irCallbacks">): Promise<string> {
  const output = astToString(await openapiTS(DOCUMENT, { silent: true, irCallbacks: true, ...options }));
  const start = output.indexOf("Item: {");
  return output.slice(start, output.indexOf("};", start) + 2);
}

describe("IR callbacks (irCallbacks: true)", () => {
  it("transform may return an IR type built with the helpers", async () => {
    const item = await itemOf({
      transform: (schema) => (schema.format === "date-time" ? tsUnion([NUMBER, NULL]) : undefined),
    });

    expect(item).toContain("updatedAt: number | null;");
    expect(item).toContain("name?: string;");
  });

  it("transform may return TypeScript type text, printed as written", async () => {
    const item = await itemOf({
      transform: (schema) => (schema.format === "date-time" ? 'Date | "id"' : undefined),
    });

    expect(item).toContain('updatedAt: Date | "id";');
  });

  it("transform may return an object that makes the property optional", async () => {
    const item = await itemOf({
      transform: (schema) => (schema.format === "date-time" ? { schema: "Date", questionToken: true } : undefined),
    });

    expect(item).toContain("updatedAt?: Date;");
  });

  it("postTransform receives the generated IR type", async () => {
    const received: string[] = [];
    const item = await itemOf({
      postTransform(type, options) {
        if (options.path?.endsWith("/name")) {
          received.push(type.kind);
          return "Uppercase<string>";
        }
        return undefined;
      },
    });

    expect(received).toEqual(["keyword"]);
    expect(item).toContain("name?: Uppercase<string>;");
  });

  it("transformProperty receives the generated IR property and may replace it", async () => {
    const item = await itemOf({
      transformProperty: (property) =>
        property.name.kind === "identifier" && property.name.text === "name"
          ? { ...property, isReadonly: true }
          : undefined,
    });

    expect(item).toContain("readonly name?: string;");
    expect(item).toContain("updatedAt: string;");
  });

  it("callbacks that return undefined keep the generated output", async () => {
    const plain = await itemOf({});
    const item = await itemOf({
      transform: () => undefined,
      postTransform: () => undefined,
      transformProperty: () => undefined,
    });

    expect(item).toBe(plain);
  });
});

describe("IR callbacks: results the generator cannot print (G12)", () => {
  it.each([
    ["transform returns {}", { transform: () => ({}) }, "transform"],
    ["postTransform returns 42", { postTransform: () => 42 }, "postTransform"],
    [
      'transform returns ""',
      { transform: (schema: { type?: unknown }) => (schema.type === "string" ? "" : undefined) },
      "transform",
    ],
    ["transform returns an empty union", { transform: () => ({ kind: "union", types: [] }) }, "transform"],
    ["transform returns a bad schema object", { transform: () => ({ schema: {}, questionToken: true }) }, "transform"],
    [
      "transform returns a reference named `a b`",
      { transform: () => ({ kind: "reference", name: "a b", typeArguments: [] }) },
      "transform",
    ],
  ])("%s fails with CALLBACK_RESULT_UNREADABLE", async (_name, callbacks, callback) => {
    const generation = itemOf(callbacks as never);

    await expect(generation).rejects.toMatchObject({
      code: "CALLBACK_RESULT_UNREADABLE",
      message: expect.stringContaining("returned a value that is not an IR type or non-empty type text"),
      details: { callback },
    });
  });

  it("transformProperty returning only a name fails with CALLBACK_RESULT_UNREADABLE", async () => {
    const generation = itemOf({ transformProperty: () => ({ name: "a" }) as never });

    await expect(generation).rejects.toMatchObject({
      code: "CALLBACK_RESULT_UNREADABLE",
      message: expect.stringMatching(/^transformProperty at .* returned a value that is not an IR property/),
      details: { callback: "transformProperty" },
    });
  });

  it("transform returning null keeps the generated type", async () => {
    expect(await itemOf({ transform: () => null as never })).toBe(await itemOf({}));
  });
});

describe("the fix option from JavaScript", () => {
  it('openapiTS with fix: "all" as a string fails with OPTION_INVALID (G12)', async () => {
    const generation = openapiTS(DOCUMENT, { silent: true, fix: "all" as never });

    await expect(generation).rejects.toMatchObject({
      code: "OPTION_INVALID",
      message: 'The fix option must be a list of fix names, such as ["all"]; got a string.',
      details: { option: "fix" },
    });
  });
});

/** The deprecated forms each run warned about (recorded also when `silent`). */
async function warningsOf(options: GeneratorOptions): Promise<string[]> {
  const runOptions = { silent: true, ...options };
  const ports = { ...(await defaultGeneratorPorts(runOptions)), deprecations: new RecordingDeprecations() };
  const { schema, ctx } = await createDocumentRun(DOCUMENT, runOptions, ports);
  transformSchema(schema, ctx);
  return [...(ctx.legacyCallbackWarnings ?? [])];
}

describe("legacy callbacks", () => {
  it("transform returning a TypeScript node warns once per run", async () => {
    const date = ts.factory.createTypeReferenceNode("Date");

    expect(await warningsOf({ transform: () => date })).toEqual(["transform"]);
    expect(await warningsOf({ transform: () => ({ schema: date, questionToken: false }) })).toEqual(["transform"]);
  });

  it("transform returning IR from the helpers does not warn", async () => {
    expect(await warningsOf({ transform: () => NUMBER })).toEqual([]);
  });

  it("postTransform and transformProperty in the TypeScript form warn", async () => {
    const warnings = await warningsOf({ postTransform: () => undefined, transformProperty: () => undefined });

    expect(warnings.sort()).toEqual(["postTransform", "transformProperty"]);
  });

  it("IR callbacks do not warn", async () => {
    const warnings = await warningsOf({
      irCallbacks: true,
      transform: () => undefined,
      postTransform: () => undefined,
      transformProperty: () => undefined,
    });

    expect(warnings).toEqual([]);
  });
});

/** The warnings of a run, and the type of `Item.updatedAt`. */
async function ignoredResultRun(options: GeneratorOptions) {
  const logger = new RecordingLogger();
  const ports = { ...(await defaultGeneratorPorts(options, logger)), deprecations: new RecordingDeprecations() };
  const { schema, ctx } = await createDocumentRun(DOCUMENT, options, ports);
  const output = astToString(transformSchema(schema, ctx));
  return { warnings: logger.messages("warn"), updatedAt: /updatedAt: ([^;]*);/.exec(output)?.[1] };
}

describe("legacy transform results the generator ignores", () => {
  it("transform returning type text without irCallbacks warns once with CALLBACK_RESULT_IGNORED", async () => {
    const run = await ignoredResultRun({ transform: (schema) => (schema.format ? "Date" : undefined) as never });

    expect(run.updatedAt).toBe("string");
    expect(run.warnings).toEqual([
      "transform at #/components/schemas/Item/updatedAt returned a string, which is " +
        "ignored without irCallbacks: true: the schema keeps its generated type (later results " +
        "like it are not reported). Set irCallbacks: true to return type text: " +
        "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks" +
        " (CALLBACK_RESULT_IGNORED)",
    ]);
  });

  it("transform returning a number without irCallbacks names the number in the warning", async () => {
    const run = await ignoredResultRun({ transform: (schema) => (schema.format ? 1 : undefined) as never });

    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain("returned a number");
  });

  it("transform returning nothing or an empty string without irCallbacks does not warn", async () => {
    expect((await ignoredResultRun({ transform: () => undefined })).warnings).toEqual([]);
    expect((await ignoredResultRun({ transform: () => "" as never })).warnings).toEqual([]);
  });
});

describe("options types (docs/node.md, Options types)", () => {
  it("GeneratorOptions takes either callback form, and the compatibility names are its members", () => {
    const irForm: GeneratorOptions = { irCallbacks: true, postTransform: (type) => type };
    const nodeForm: GeneratorOptions = { postTransform: (type) => type };

    expectTypeOf(irForm).toExtend<GeneratorOptions>();
    expectTypeOf(nodeForm).toExtend<GeneratorOptions>();
    expectTypeOf<OpenAPITSOptions | OpenAPITSIrOptions>().toEqualTypeOf<GeneratorOptions>();
  });
});
