import { describe, expect, it } from "vitest";
import openapiTS, {
  astToString,
  NULL,
  NUMBER,
  type OpenAPI3,
  type OpenAPITSIrOptions,
  tsUnion,
} from "../../src/index.js";

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
