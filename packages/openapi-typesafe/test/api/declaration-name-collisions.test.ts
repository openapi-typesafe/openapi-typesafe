import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import {
  strictTypeErrors,
  TSC_TIMEOUT_MS,
  TYPESCRIPT_PACKAGES,
  type TypeScriptVersion,
} from "../typescript-versions.js";

/**
 * Generated declarations take distinct names (RC4 G7–G10): an enum gives way to a global type the
 * output refers to (`Blob`, `Record`), to the enum of another schema with the same name, and to
 * `ApiPaths`; a root alias gives way to every other declaration. Operations with a repeated
 * `operationId` get distinct keys (G15).
 */

function documentWith(schemas: Record<string, object>, paths: object = {}): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths,
    components: { schemas },
  } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions): Promise<string> {
  return astToString(await openapiTS(structuredClone(document), { silent: true, ...options }));
}

const BLOB_DOCUMENT = documentWith({
  Blob: { type: "string", enum: ["b"] },
  Upload: {
    type: "object",
    required: ["f"],
    properties: { f: { type: "string", format: "binary" } },
  },
});
const STATUS_DOCUMENT = documentWith({
  status: { type: "string", enum: ["active"] },
  Status: { type: "string", enum: ["deleted"] },
});
const RECORD_DOCUMENT = documentWith({ Record: { type: "string", enum: ["r"] } });
const API_PATHS_DOCUMENT = documentWith(
  { ApiPaths: { type: "string", enum: ["x"] } },
  { "/a": { get: { responses: { 200: { description: "ok" } } } } },
);

describe("enums that would shadow a global type", () => {
  it("an enum named Blob gives way to the Blob of --binary-as-blob (G7)", async () => {
    const output = await generate(BLOB_DOCUMENT, { enum: true, binaryAsBlob: true });

    expect(output).toContain("export enum Blob_2 {");
    expect(output).toContain("Blob: Blob_2;");
    expect(output).toContain("f: Blob;");
  });

  it("an enum named Blob keeps its name when the output does not refer to Blob", async () => {
    const output = await generate(BLOB_DOCUMENT, { enum: true });

    expect(output).toContain("export enum Blob {");
    expect(output).toContain("Blob: Blob;");
  });

  it("an enum named Record gives way to Record<string, never> (G9)", async () => {
    const output = await generate(RECORD_DOCUMENT, { enum: true });

    expect(output).toContain("export enum Record_2 {");
    expect(output).toContain("export type $defs = Record<string, never>;");
  });
});

describe("enums of two schemas with one name", () => {
  it("the later schema's enum gets the next number instead of merging (G8)", async () => {
    const output = await generate(STATUS_DOCUMENT, { enum: true });

    expect(output).toContain("status: Status;");
    expect(output).toContain("Status: Status_2;");
    expect(output).toContain('export enum Status_2 {\n    deleted = "deleted"\n}');
  });

  it("a schema enum named ApiPaths gives way to the --make-paths-enum enum (G8)", async () => {
    const output = await generate(API_PATHS_DOCUMENT, { enum: true, makePathsEnum: true });

    expect(output).toContain("ApiPaths: ApiPaths_2;");
    expect(output).toContain("export enum ApiPaths_2 {");
    expect(output).toContain("export enum ApiPaths {");
  });
});

describe("root aliases that collide with ApiPaths", () => {
  it("the alias of a schema named ApiPaths gets a number (G10)", async () => {
    const output = await generate(API_PATHS_DOCUMENT, {
      makePathsEnum: true,
      rootTypes: true,
      rootTypesNoSchemaPrefix: true,
    });

    expect(output).toContain("export type ApiPaths_2 = components['schemas']['ApiPaths'];");
    expect(output).toContain("export enum ApiPaths {");
  });
});

const REPEATED_OPERATION_ID_DOCUMENT = {
  ...documentWith({}),
  paths: {
    "/a": { get: { operationId: "dup", responses: { 200: { description: "ok" } } } },
    "/b": { post: { operationId: "dup", responses: { 204: { description: "ok" } } } },
    "/c": { put: { operationId: "dup2", responses: { 201: { description: "ok" } } } },
  },
} as OpenAPI3;

describe("operations with a repeated operationId", () => {
  it("the later operation gets the lowest free number as its key (G15)", async () => {
    // The Node API fails on the lint error by default; the CLI only warns (LINT_PROBLEM).
    const output = await generate(REPEATED_OPERATION_ID_DOCUMENT, { lint: false });

    expect(output).toContain('get: operations["dup"];');
    expect(output).toContain('post: operations["dup3"];');
    expect(output).toContain('put: operations["dup2"];');
    expect(output.match(/^ {4}dup\d?: \{$/gm)).toEqual(["    dup: {", "    dup3: {", "    dup2: {"]);
  });
});

/** Assignments that must compile against the generated files, and one that must not. */
const BLOB_CHECK = `import type { components } from "./blob";
export const upload: components["schemas"]["Upload"] = { f: new Blob(["x"]) };
`;
const STATUS_CHECK = `import { Status_2, type components } from "./status";
// @ts-expect-error a value of another schema's enum is not a value of \`status\`
export const wrong: components["schemas"]["status"] = Status_2.deleted;
`;

describe.each(Object.keys(TYPESCRIPT_PACKAGES) as TypeScriptVersion[])("the outputs with TypeScript %s", (version) => {
  it(
    "compile under --strict and keep the types apart",
    async () => {
      const files = {
        "blob.ts": await generate(BLOB_DOCUMENT, { enum: true, binaryAsBlob: true }),
        "blob-check.ts": BLOB_CHECK,
        "status.ts": await generate(STATUS_DOCUMENT, { enum: true }),
        "status-check.ts": STATUS_CHECK,
        "record.ts": await generate(RECORD_DOCUMENT, { enum: true, rootTypes: true }),
        "api-paths.ts": await generate(API_PATHS_DOCUMENT, {
          enum: true,
          makePathsEnum: true,
          rootTypes: true,
          rootTypesNoSchemaPrefix: true,
        }),
      };

      expect(await strictTypeErrors(files, version)).toEqual([]);
    },
    TSC_TIMEOUT_MS,
  );
});
