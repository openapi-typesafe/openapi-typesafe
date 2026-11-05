import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` with `--root-types --root-types-no-schema-prefix`: an enum named after a property path
 * (`Cluster` + `state`) and the root alias of a schema with that name (`ClusterState`) were both
 * exported as `ClusterState` (upstream #2099, #2341, #2206).
 */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Cluster: { type: "object", properties: { state: { type: "string", enum: ["a", "b"] } } },
      ClusterState: { type: "object", properties: { id: { type: "string" } } },
    },
  },
};

const OPTIONS = { silent: true, enum: true, rootTypes: true, rootTypesNoSchemaPrefix: true };

describe("root type aliases that collide with an enum", () => {
  it("openapiTS renames the root alias with the next free suffix and keeps the enum", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), OPTIONS));

    expect(output).toContain("export type ClusterState_2 = components['schemas']['ClusterState'];");
    expect(output).toContain("export enum ClusterState {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps root aliases that do not collide", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), OPTIONS));

    expect(output).toContain("export type Cluster = components['schemas']['Cluster'];");
  });
});

describe("root type aliases that collide with a helper type", () => {
  it("openapiTS renames the alias of a schema named WithRequired, which the helper keeps", async () => {
    const document: OpenAPI3 = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: {
        schemas: {
          Base: { type: "object", properties: { id: { type: "string" } } },
          WithRequired: {
            type: "object",
            required: ["id"],
            allOf: [{ $ref: "#/components/schemas/Base" }],
          },
        },
      },
    };

    const output = astToString(
      await openapiTS(document, { silent: true, rootTypes: true, rootTypesNoSchemaPrefix: true }),
    );

    expect(output).toContain("export type WithRequired_2 = components['schemas']['WithRequired'];");
    expect(output).toContain("type WithRequired<T, K extends keyof T> = T & {");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("root type aliases that shadow a TypeScript global type", () => {
  const ROOT_OPTIONS = { silent: true, rootTypes: true, rootTypesNoSchemaPrefix: true };

  function documentWith(schemas: Record<string, object>): OpenAPI3 {
    return {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: { schemas },
    } as OpenAPI3;
  }

  it("openapiTS renames the alias of a schema named Record, which the output uses", async () => {
    const document = documentWith({
      Record: { type: "object", properties: { id: { type: "string" } } },
    });

    const output = astToString(await openapiTS(document, ROOT_OPTIONS));

    expect(output).toContain("export type Record_2 = components['schemas']['Record'];");
    expect(output).toContain("Record<string, never>");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS renames the alias of a schema named Blob, which --binary-as-blob uses", async () => {
    const upload = { type: "string", format: "binary" };
    const document = {
      ...documentWith({ Blob: { type: "object", properties: { id: { type: "string" } } } }),
      paths: {
        "/upload": {
          post: {
            requestBody: { content: { "application/octet-stream": { schema: upload } } },
            responses: { 200: { description: "ok" } },
          },
        },
      },
    } as OpenAPI3;

    const output = astToString(await openapiTS(document, { ...ROOT_OPTIONS, binaryAsBlob: true }));
    // The body is the global Blob (declared here: the check has no DOM library), not the schema.
    const code = `${output}
declare global {
  interface Blob { readonly size: number }
  var Blob: { new (): Blob };
}
const blob = { "application/octet-stream": new Blob() };
const body: paths["/upload"]["post"]["requestBody"] = { content: blob };`;

    expect(output).toContain("export type Blob_2 = components['schemas']['Blob'];");
    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps the alias of a global type name that the output does not use", async () => {
    const document = documentWith({
      Omit: { type: "object", properties: { id: { type: "string" } } },
    });

    const output = astToString(await openapiTS(document, ROOT_OPTIONS));

    expect(output).toContain("export type Omit = components['schemas']['Omit'];");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
