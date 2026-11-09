import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { parametersMember } from "../../../../src/application/transform/document/parameters.js";
import { irObject } from "../../../../src/domain/ir/constructors.js";
import type { ParameterOrReference } from "../../../../src/domain/openapi/parameter-object.js";
import { type FakeContextInput, fakeTransformContext } from "../../../fakes/transform-context.js";

const LOCATION = { path: "#/paths/~1b/get" };
const OPTIONAL_QUERY = { name: "q", in: "query", schema: { type: "string" } };
const REQUIRED_QUERY = { name: "r", in: "query", required: true, schema: { type: "string" } };
const COOKIE = { name: "c", in: "cookie", schema: { type: "string" } };
const QUERYSTRING = { name: "qs", in: "querystring", schema: { type: "string" } };

/** A document where `/a` has a `get` with the given parameters and the path item `parameters`. */
function documentsWith(
  operationParameters: readonly unknown[],
  pathItemParameters: readonly unknown[] = [],
): Record<string, unknown> {
  const operation = { parameters: operationParameters };
  const pathItem = { parameters: pathItemParameters, get: operation };
  const documents: Record<string, unknown> = {
    "#/paths/~1a": pathItem,
    "#/paths/~1a/get": operation,
  };
  operationParameters.forEach((parameter, index) => {
    documents[`#/paths/~1a/get/parameters/${index}`] = parameter;
  });
  pathItemParameters.forEach((parameter, index) => {
    documents[`#/paths/~1a/parameters/${index}`] = parameter;
  });
  return documents;
}

function printReferenced(ref: string, input: FakeContextInput): string {
  const { context } = fakeTransformContext(input);
  const parameters = [{ $ref: ref }] as ParameterOrReference[];
  const member = parametersMember(parameters, LOCATION, context);
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: irObject([member]) }]);
}

describe("referencedParameterType", () => {
  it("a $ref to a parameter of an all-optional location indexes NonNullable of it", () => {
    const documents = documentsWith([OPTIONAL_QUERY]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('q?: NonNullable<paths["/a"]["get"]["parameters"]["query"]>["q"];');
  });

  it("a $ref to a parameter of a location with a required parameter keeps the original", () => {
    const documents = documentsWith([OPTIONAL_QUERY, REQUIRED_QUERY]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('q?: paths["/a"]["get"]["parameters"]["query"]["q"];');
  });

  it("a $ref to a required parameter keeps the original", () => {
    const documents = documentsWith([REQUIRED_QUERY]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('r: paths["/a"]["get"]["parameters"]["query"]["r"];');
  });

  it("a $ref counts only the parameters of the target's own location", () => {
    const header = { name: "h", in: "header", required: true, schema: { type: "string" } };
    const documents = documentsWith([OPTIONAL_QUERY, header]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('q?: NonNullable<paths["/a"]["get"]["parameters"]["query"]>["q"];');
  });

  it("a $ref to a path parameter keeps the original: path parameters are always required", () => {
    const path = { name: "id", in: "path", schema: { type: "string" } };
    const documents = documentsWith([path]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('id: paths["/a"]["get"]["parameters"]["path"]["id"];');
  });

  it("a $ref into another file keeps the original", () => {
    const ref = "./other.yaml#/paths/~1a/get/parameters/0";
    const documents = { ...documentsWith([OPTIONAL_QUERY]), [ref]: OPTIONAL_QUERY };

    const text = printReferenced(ref, { documents });

    expect(text).toContain('q?: paths["/a"]["get"]["parameters"]["query"]["q"];');
  });

  it("a $ref to a path item parameter indexes the path item's parameters", () => {
    const documents = documentsWith([], [COOKIE]);

    const text = printReferenced("#/paths/~1a/parameters/0", { documents });

    expect(text).toContain('c?: NonNullable<paths["/a"]["parameters"]["cookie"]>["c"];');
  });

  it("a $ref to an operation parameter counts the path item parameters it inherits", () => {
    const required = { ...REQUIRED_QUERY, name: "inherited" };
    const documents = documentsWith([OPTIONAL_QUERY], [required]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('q?: paths["/a"]["get"]["parameters"]["query"]["q"];');
  });

  it("a $ref counts only the parameters that --exclude-deprecated keeps", () => {
    const deprecated = { ...REQUIRED_QUERY, deprecated: true };
    const documents = documentsWith([OPTIONAL_QUERY, deprecated]);
    const options = { excludeDeprecated: true };

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents, options });

    expect(text).toContain('q?: NonNullable<paths["/a"]["get"]["parameters"]["query"]>["q"];');
  });

  it("a $ref to a querystring parameter is the target's query member", () => {
    const documents = documentsWith([QUERYSTRING]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('query?: paths["/a"]["get"]["parameters"]["query"];');
  });

  it("a $ref to a querystring parameter next to query parameters keeps the original", () => {
    const documents = documentsWith([QUERYSTRING, OPTIONAL_QUERY]);

    const text = printReferenced("#/paths/~1a/get/parameters/0", { documents });

    expect(text).toContain('["parameters"]["querystring"]["qs"]');
  });

  it("a $ref into an additional operation or a component path item is corrected too", () => {
    const operation = { parameters: [OPTIONAL_QUERY] };
    const documents = {
      "#/components/pathItems/Shared": { additionalOperations: { LINK: operation } },
      "#/components/pathItems/Shared/additionalOperations/LINK": operation,
      "#/components/pathItems/Shared/additionalOperations/LINK/parameters/0": OPTIONAL_QUERY,
    };
    const ref = "#/components/pathItems/Shared/additionalOperations/LINK/parameters/0";

    const text = printReferenced(ref, { documents });

    expect(text).toContain(
      'NonNullable<components["pathItems"]["Shared"]["additionalOperations"]["LINK"]' +
        '["parameters"]["query"]>["q"]',
    );
  });

  it("a $ref into a list typed elsewhere or not typed keeps the original", () => {
    const documents = {
      "#/paths/~1a": { get: { $ref: "#/components/x" } },
      "#/paths/~1a/get": { $ref: "#/components/x" },
      "#/paths/~1a/get/parameters/0": OPTIONAL_QUERY,
      "#/paths/~1a/post/callbacks/c/x/get/parameters/0": OPTIONAL_QUERY,
    };

    const typedElsewhere = printReferenced("#/paths/~1a/get/parameters/0", { documents });
    const callback = printReferenced("#/paths/~1a/post/callbacks/c/x/get/parameters/0", {
      documents,
    });

    expect(typedElsewhere).toContain('q?: paths["/a"]["get"]["parameters"]["query"]["q"];');
    expect(callback).toContain('["callbacks"]["c"]["x"]["get"]["parameters"]["query"]["q"];');
  });
});
