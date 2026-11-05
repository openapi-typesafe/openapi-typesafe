import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { operationMembers } from "../../../../src/application/transform/document/operation.js";
import { pathItemType } from "../../../../src/application/transform/document/path-item.js";
import { pathsType } from "../../../../src/application/transform/document/paths.js";
import { apiPathsEnum } from "../../../../src/application/transform/document/paths-enum.js";
import { webhooksType } from "../../../../src/application/transform/document/webhooks.js";
import { irObject } from "../../../../src/domain/ir/constructors.js";
import type { IrType } from "../../../../src/domain/ir/nodes.js";
import type { PathsObject } from "../../../../src/domain/openapi/path-item-object.js";
import { OutputFix } from "../../../../src/domain/output-fixes.js";
import { type FakeContextInput, fakeTransformContext } from "../../../fakes/transform-context.js";

const LOCATION = { path: "#/paths/~1items/get" };
const DOCUMENTS = {
  "#/components/requestBodies/Body": { required: true },
  "#/paths/~1old/get": { deprecated: true },
  "#/components/parameters/Count": { name: "count", in: "path", schema: { type: "integer" } },
};

function print(type: IrType): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type }]).slice("type T = ".length, -2);
}

function transformPaths(paths: unknown, input: FakeContextInput = {}) {
  const fake = fakeTransformContext({ documents: DOCUMENTS, ...input });
  return { text: print(pathsType(paths as PathsObject, fake.context)), ...fake };
}

describe("operationMembers", () => {
  it("operationMembers without a body has requestBody?: never and responses never", () => {
    const { context } = fakeTransformContext();

    const text = print(irObject(operationMembers({}, LOCATION, context)));

    expect(text).toContain("requestBody?: never;");
    expect(text).toContain("responses: never;");
  });

  it("operationMembers with a referenced body is required when the target is", () => {
    const { context } = fakeTransformContext({ documents: DOCUMENTS });
    const operation = { requestBody: { $ref: "#/components/requestBodies/Body" } };

    const text = print(irObject(operationMembers(operation, LOCATION, context)));

    expect(text).toContain('requestBody: components["requestBodies"]["Body"];');
  });

  it("operationMembers with an inline body that is not required makes it optional", () => {
    const { context } = fakeTransformContext({ options: { immutable: true } });

    const text = print(irObject(operationMembers({ requestBody: {} }, LOCATION, context)));

    expect(text).toContain("readonly requestBody?: {");
  });
});

describe("pathItemType", () => {
  it("pathItemType lists every method; missing and excluded ones are never", () => {
    const { context } = fakeTransformContext({
      documents: DOCUMENTS,
      options: { excludeDeprecated: true },
    });
    const pathItem = { get: { $ref: "#/paths/~1old/get" }, post: { $ref: "#/paths/~1new/post" } };

    const text = print(pathItemType(pathItem, { path: "#/paths/~1items" }, context));

    expect(text).toContain("get?: never;");
    expect(text).toContain('post: paths["/new"]["post"];');
    expect(text).toContain("trace?: never;");
  });

  it("pathItemType moves an operation with an ID to the operations footer", () => {
    const { context, footer } = fakeTransformContext();
    const pathItem = { get: { operationId: "list#all", description: "List" } };

    const text = print(pathItemType(pathItem, { path: "#/paths/~1items" }, context));

    expect(text).toContain('/** @description List */\n    get: operations["list/all"];');
    expect(footer.operations.map((member) => member.name)).toEqual([
      { kind: "string", value: "list/all" },
    ]);
  });

  it("pathItemType lets an operation parameter replace the path item parameter", () => {
    const { context } = fakeTransformContext();
    const pathItem = {
      parameters: [{ name: "q", in: "query", schema: { type: "number" } }],
      get: { parameters: [{ name: "q", in: "query", required: true }] },
    } as const;

    const text = print(pathItemType(pathItem, { path: "#/paths/~1items" }, context));

    expect(text).toContain(
      "get: {\n        parameters: {\n            query: {\n                q: string;",
    );
  });
});

describe("pathsType", () => {
  it("pathsType skips non-object entries and references $ref path items", () => {
    const { text } = transformPaths({ "/a": null, "/b": { $ref: "#/components/pathItems/B" } });

    expect(text).toBe('{\n    "/b": components["pathItems"]["B"];\n}');
  });

  it("pathsType with --path-params-as-types keys templated paths by a template literal", () => {
    const paths = {
      "/a/{count}/{other}": { parameters: [{ $ref: "#/components/parameters/Count" }] },
    };

    const { text, diagnostics } = transformPaths(paths, { options: { pathParamsAsTypes: true } });

    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected output is a template literal type
    expect(text).toContain("[path: `/a/${number}/${string}`]: {");
    expect(diagnostics.messages).toEqual([]);
  });

  it("pathsType replaces a parameter named like a type inside the placeholder before, as the original", () => {
    const parameters = ["id", "number"].map((name) => ({
      name,
      in: "path",
      schema: { type: "integer" },
    }));
    const paths = { "/invoices/{id}/lines/{number}": { parameters } };

    const { text } = transformPaths(paths, { options: { pathParamsAsTypes: true } });

    // The original replaces the first `{number}`, which is in the `${number}` of `{id}`.
    expect(text).toContain("[path: `/invoices/$${number}/lines/{number}`]: {");
  });

  it("pathsType with the path-param-type-names fix gives each parameter its placeholder", () => {
    const parameters = ["id", "number"].map((name) => ({
      name,
      in: "path",
      schema: { type: "integer" },
    }));
    const paths = { "/invoices/{id}/lines/{number}": { parameters } };
    const options = { pathParamsAsTypes: true, fixes: new Set([OutputFix.PATH_PARAM_TYPE_NAMES]) };

    const { text } = transformPaths(paths, { options });

    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected output is a template literal type
    expect(text).toContain("[path: `/invoices/${number}/lines/${number}`]: {");
  });

  it("pathsType keeps a property when the template is not complete", () => {
    const paths = { "/b/{open": {} };

    const { text, diagnostics } = transformPaths(paths, { options: { pathParamsAsTypes: true } });

    expect(text).toContain('"/b/{open": {');
    expect(diagnostics.messages).toEqual([
      { message: 'Transformed path "/b/{open"', durationMs: 1 },
    ]);
  });

  it("pathsType escapes a backtick in the URL of a template", () => {
    const { text } = transformPaths({ "/a`b/{id}": {} }, { options: { pathParamsAsTypes: true } });

    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected output is a template literal type
    expect(text).toContain("[path: `/a\\`b/${string}`]: {");
  });

  it("pathsType escapes backslashes, placeholders and carriage returns in the URL of a template", () => {
    const url = "/{id}/a\\`]: never; }; //\r$" + "{";

    const { text } = transformPaths({ [url]: {} }, { options: { pathParamsAsTypes: true } });

    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected output is a template literal type
    expect(text).toContain("[path: `/${string}/a\\\\\\`]: never; }; //\\r\\${`]: {");
  });
});

describe("webhooksType", () => {
  it("webhooksType has one path item per name", () => {
    const { context } = fakeTransformContext({ options: { immutable: true } });

    const text = print(webhooksType({ ping: {} }, context));

    expect(text).toContain("readonly ping: {");
  });
});

describe("apiPathsEnum", () => {
  it("apiPathsEnum names members by operation ID or by method and URL", () => {
    const paths = {
      "/users/{id}": { get: { operationId: "getUser" }, post: {}, parameters: [] },
      "/a-b/:x": { delete: {} },
    };

    expect(apiPathsEnum(paths as PathsObject)).toEqual({
      values: ["/users/{id}", "/users/{id}", "/a-b/:x"],
      metadata: [
        { name: "getUser", description: undefined },
        { name: "PostUsers", description: undefined },
        { name: "DeleteAb", description: undefined },
      ],
    });
  });
});
