import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts, generateDeclarations } from "../../src/api/openapi-ts.js";
import { createTransformContext } from "../../src/api/transform-context.js";
import transformSchema from "../../src/api/transform-schema.js";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { RecordingDeprecations } from "../fakes/recording-deprecations.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Schema `$ref`s through shapes the shape model of ADR-026 does not read: the type a pass writes
 * is checked against the generated types, and one that surely does not compile is typed in place
 * in the next pass. A type that compiles stays as it was.
 */

const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });
const STRING = { type: "string" };

function documentOf(schemas: Record<string, unknown>): OpenAPI3 {
  const info = { title: "t", version: "1" };
  return { openapi: "3.1.0", info, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(documentOf(schemas), { silent: true, ...options }));
}

function aliasOf(output: string, name: string): string | undefined {
  return new RegExp(`^ {8}${name}: (.*);$`, "m").exec(output)?.[1];
}

/** An object with a `oneOf` of a string list type: the generated type is `string | { … }`. */
const STRING_OR_OBJECT = {
  type: ["object"],
  properties: { email: STRING },
  oneOf: [{ type: ["string"] }],
};

/** A type list of an object and a string, which the shape model of the walk does not read. */
const TYPE_LIST = { type: ["object", "string"], properties: { email: STRING } };

describe("schema $refs whose written type the generated types do not have", () => {
  it("openapiTS types a $ref into a variant of a null oneOf in place", async () => {
    const output = await generate({ Contact: { oneOf: [{ type: "null" }] }, R: ref("Contact/oneOf/0") });

    expect(aliasOf(output, "R")).toBe("null");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each([[[]], [["ref-pointers"]], [["all"]]] as const)(
    "openapiTS with fix %j types a property of a union with a string in place",
    async (fix) => {
      const schemas = { Contact: STRING_OR_OBJECT, R: ref("Contact/properties/email") };

      const output = await generate(schemas, { fix: [...fix] });

      expect(aliasOf(output, "R")).toBe("string");
      expect(typeErrorsOf(output)).toEqual([]);
    },
  );

  it.each([[[]], [["ref-pointers"]]] as const)(
    "openapiTS with fix %j types a property of a type list in place",
    async (fix) => {
      const output = await generate({ Contact: TYPE_LIST, R: ref("Contact/properties/email") }, { fix: [...fix] });

      expect(aliasOf(output, "R")).toBe("string");
      expect(typeErrorsOf(output)).toEqual([]);
    },
  );

  it("openapiTS types a property that is a $ref of a type list in place", async () => {
    const contact = { ...TYPE_LIST, properties: { email: ref("Leaf") } };

    const output = await generate({ Leaf: STRING, Contact: contact, R: ref("Contact/properties/email") });

    expect(aliasOf(output, "R")).toBe('components["schemas"]["Leaf"]');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps a pointer the generated types have", async () => {
    const contact = { type: "object", properties: { email: STRING }, oneOf: [{ type: "object" }] };

    const output = await generate({ Contact: contact, R: ref("Contact/properties/email") });

    expect(aliasOf(output, "R")).toBe('components["schemas"]["Contact"]["email"]');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS checks a $ref that only an allOf item holds", async () => {
    const schemas = { Contact: STRING_OR_OBJECT, H: { allOf: [ref("Contact/properties/email")] } };

    const output = await generate(schemas);

    expect(aliasOf(output, "H")).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a deeper $ref through the same union in place", async () => {
    const schemas = {
      Contact: { ...STRING_OR_OBJECT, properties: { email: { type: "object", properties: { at: STRING } } } },
      R: ref("Contact/properties/email/properties/at"),
    };

    const output = await generate(schemas);

    expect(aliasOf(output, "R")).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("$ref pointer checks into templated paths", () => {
  it("openapiTS with --path-params-as-types reads a $ref into a templated path as written", async () => {
    const response = { content: { "application/json": { schema: { type: "object", properties: { name: STRING } } } } };
    const operation = {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: { 200: { description: "ok", ...response } },
    };
    const document = {
      ...documentOf({
        R: { $ref: "#/paths/~1pets~1{id}/get/responses/200/content/application~1json/schema/properties/name" },
      }),
      paths: { "/pets/{id}": { get: operation } },
    } as OpenAPI3;

    const output = astToString(await openapiTS(document, { silent: true, pathParamsAsTypes: true }));

    expect(aliasOf(output, "R")).toContain("paths[");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("the passes of the $ref pointer checks", () => {
  async function transformCalls(schemas: Record<string, unknown>): Promise<number> {
    let calls = 0;
    const transform = () => {
      calls++;
      return undefined;
    };
    await openapiTS(documentOf(schemas), { silent: true, transform });
    return calls;
  }

  it("openapiTS runs one pass where every pointer type compiles", async () => {
    const contact = { type: "object", properties: { email: STRING }, oneOf: [{ type: "object" }] };
    const plain = await transformCalls({ Contact: contact, R: ref("Contact") });

    const pointed = await transformCalls({ Contact: contact, R: ref("Contact/properties/email") });

    expect(pointed).toBe(plain);
  });

  it("openapiTS runs one pass where the failing target would be written inside itself", async () => {
    const treeOf = (item: object) => ({
      type: "object",
      properties: { children: { type: "object", additionalProperties: item } },
      definitions: {
        item: { type: "object", properties: { children: { type: "object", additionalProperties: item } } },
      },
    });
    const plain = await transformCalls({ Tree: treeOf(ref("Tree")) });

    const pointed = await transformCalls({ Tree: treeOf(ref("Tree/definitions/item")) });

    expect(pointed).toBe(plain);
  });

  it("openapiTS runs a second pass where a pointer type does not compile", async () => {
    const plain = await transformCalls({ Contact: TYPE_LIST, R: ref("Contact") });

    const pointed = await transformCalls({ Contact: TYPE_LIST, R: ref("Contact/properties/email") });

    expect(pointed).toBeGreaterThan(plain + 1);
  });
});

describe("the messages and footer of the $ref pointer passes", () => {
  const STATE = (values: string[]) => ({ type: "object", properties: { state: { type: "string", enum: values } } });
  const EXCLUDING = {
    Base: STATE(["open", "converting"]),
    Created: { allOf: [ref("Base"), STATE(["open", "locked"])] },
  };

  async function run(schemas: Record<string, unknown>) {
    const info = { title: "t", version: "1" };
    const document = { openapi: "3.1.0", info, paths: {}, components: { schemas } };
    const ports = await defaultGeneratorPorts({ silent: true });
    const logger = new RecordingLogger();
    const options = { silent: true, enumValues: true };
    const declarations = await generateDeclarations(JSON.stringify(document), options, { ...ports, logger });
    return { output: astToString(declarations), warnings: logger.messages("warn") };
  }

  it.each([
    ["a pointer that compiles", ref("Base/properties/state")],
    ["a pointer typed in place", ref("Contact/properties/email")],
  ])("generateDeclarations warns once and writes the footer once with %s", async (_label, target) => {
    const { output, warnings } = await run({ ...EXCLUDING, Contact: TYPE_LIST, R: target });

    expect(warnings).toHaveLength(1);
    expect(output.match(/export const createdStateValues:/g)).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations reports a deprecated callback form once over both passes", async () => {
    const document = documentOf({ Contact: TYPE_LIST, R: ref("Contact/properties/email") });
    const deprecations = new RecordingDeprecations();
    const ports = { ...(await defaultGeneratorPorts({ silent: true })), deprecations };

    await generateDeclarations(JSON.stringify(document), { silent: true, postTransform: (type) => type }, ports);

    expect(deprecations.codes()).toEqual(["OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM"]);
  });

  it("transformSchema keeps the footer of the pass it keeps on the context", async () => {
    const options = { silent: true };
    const contact = { type: "object", properties: { email: STRING }, oneOf: [{ type: "object" }] };
    const document = documentOf({ Contact: contact, R: ref("Contact/properties/email") });
    const ports = await defaultGeneratorPorts(options);
    const { schema, ctx } = await createDocumentRun(JSON.stringify(document), options, ports);

    transformSchema(schema, ctx);

    expect(ctx.runFooter).toBeDefined();
  });

  it("transformSchema writes the footer on a context whose footer an earlier call created", async () => {
    const options = { silent: true, enumValues: true };
    const schemas = { ...EXCLUDING, Contact: TYPE_LIST, R: ref("Contact/properties/email") };
    const ports = await defaultGeneratorPorts(options);
    const { schema, ctx } = await createDocumentRun(JSON.stringify(documentOf(schemas)), options, ports);
    createTransformContext(ctx);

    const output = astToString(transformSchema(schema, ctx));

    expect(output).toContain("export const createdStateValues:");
    expect(aliasOf(output, "R")).toBe("string");
  });

  it("transformSchema types a failing pointer in place on a context with a footer", async () => {
    const options = { silent: true };
    const document = documentOf({ Contact: TYPE_LIST, R: ref("Contact/properties/email") });
    const ports = await defaultGeneratorPorts(options);
    const { schema, ctx } = await createDocumentRun(JSON.stringify(document), options, ports);
    transformSchema(schema, ctx);

    const output = astToString(transformSchema(schema, ctx));

    expect(aliasOf(output, "R")).toBe("string");
  });
});
