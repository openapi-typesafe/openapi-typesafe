import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import {
  strictTypeErrors,
  TSC_TIMEOUT_MS,
  TYPESCRIPT_PACKAGES,
  type TypeScriptVersion,
} from "../typescript-versions.js";

/**
 * The `ref-siblings` and `parameter-header-content` fixes (ADR-021 amendments): keywords next to
 * a `$ref` apply in OpenAPI 3.1 and 3.2 (JSON Schema 2020-12 §8.2.3.1), not in 3.0; a parameter
 * or a header with `content` is typed by its media type's schema (OpenAPI §4.8.12.1, §4.8.21).
 */

const BASE = { $ref: "#/components/schemas/Base" };
const FILTER = {
  name: "filter",
  in: "query",
  content: {
    "application/json": {
      schema: { type: "object", required: ["z"], properties: { z: { type: "string" } } },
    },
  },
};

const HEADERS = {
  "X-Rate": { required: true, content: FILTER.content },
  "X-Empty": { content: {} },
};

function documentOf(version: string): OpenAPI3 {
  return {
    openapi: version,
    info: { title: "t", version: "1" },
    paths: {
      "/p": { get: { parameters: [FILTER], responses: { 200: { description: "ok", headers: HEADERS } } } },
    },
    components: {
      schemas: {
        Base: { type: "object", properties: { id: { type: "string" } } },
        WithSiblings: { ...BASE, required: ["extra"], properties: { extra: { type: "string" } } },
        OnlyRequired: { ...BASE, required: ["id"] },
        Described: { ...BASE, description: "A base." },
        Holder: {
          type: "object",
          properties: { owner: { ...BASE, required: ["id"] }, label: { ...BASE, description: "A label." } },
        },
      },
    },
  } as unknown as OpenAPI3;
}

async function generate(version: string, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentOf(version), { silent: true, ...options }));
}

const SIBLINGS = '        WithSiblings: {\n            extra: string;\n        } & components["schemas"]["Base"];';

describe("ref-siblings fix", () => {
  it("openapiTS without the fix keeps the plain reference", async () => {
    const output = await generate("3.1.0");

    expect(output).toContain('WithSiblings: components["schemas"]["Base"];');
  });

  it("openapiTS with the fix intersects the reference with its siblings in 3.1", async () => {
    const output = await generate("3.1.0", { fix: ["ref-siblings"] });

    expect(output).toContain(SIBLINGS);
    expect(output).toContain('OnlyRequired: WithRequired<components["schemas"]["Base"], "id">;');
  });

  it("openapiTS with the fix reads the siblings of a property's reference too", async () => {
    const output = await generate("3.1.0", { fix: ["ref-siblings"] });

    expect(output).toContain('owner?: WithRequired<components["schemas"]["Base"], "id">;');
    expect(output).toContain('label?: components["schemas"]["Base"];');
  });

  it("openapiTS without the fix keeps a property's plain reference", async () => {
    expect(await generate("3.1.0")).toContain('owner?: components["schemas"]["Base"];');
  });

  it("openapiTS with the fix keeps a reference with only annotations next to it", async () => {
    const output = await generate("3.2.0", { fix: ["ref-siblings"] });

    expect(output).toContain('/** @description A base. */\n        Described: components["schemas"]["Base"];');
  });

  it("openapiTS with the fix ignores the siblings in OpenAPI 3.0, as its spec says", async () => {
    const output = await generate("3.0.3", { fix: ["ref-siblings"] });

    expect(output).toContain('WithSiblings: components["schemas"]["Base"];');
    expect(output).toContain('OnlyRequired: components["schemas"]["Base"];');
  });
});

describe("parameter-header-content fix", () => {
  it("openapiTS without the fix types a content parameter as string", async () => {
    expect(await generate("3.1.0")).toContain("filter?: string;");
  });

  it.each(["3.0.3", "3.1.0"])("openapiTS with the fix types it by its media type in %s", async (version) => {
    const output = await generate(version, { fix: ["parameter-header-content"] });

    expect(output).toContain("filter?: {\n                        z: string;\n                    };");
  });

  it("openapiTS without the fix types a content header as a map of its media types", async () => {
    const output = await generate("3.1.0");

    expect(output).toMatch(/"X-Rate": \{\n\s+"application\/json": \{\n\s+z: string;/);
    expect(output).toContain('"X-Empty"?: {};');
  });

  it("openapiTS with the fix types a content header by its media type", async () => {
    const output = await generate("3.1.0", { fix: ["parameter-header-content"] });

    expect(output).toMatch(/"X-Rate": \{\n\s+z: string;\n\s+\};/);
    expect(output).toContain('"X-Empty"?: unknown;');
  });
});

describe.each(Object.keys(TYPESCRIPT_PACKAGES) as TypeScriptVersion[])(
  "the fixed output with TypeScript %s",
  (version) => {
    it(
      "compiles under --strict",
      async () => {
        const files = {
          "fixed-3-1.ts": await generate("3.1.0", { fix: ["ref-siblings", "parameter-header-content"] }),
          "fixed-3-0.ts": await generate("3.0.3", { fix: ["all"] }),
        };

        expect(await strictTypeErrors(files, version)).toEqual([]);
      },
      TSC_TIMEOUT_MS,
    );
  },
);
