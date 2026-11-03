import { describe, expect, it } from "vitest";
import { findUnsupportedFeatures } from "../../../src/domain/openapi/unsupported-features.js";

const QUERYSTRING = { name: "filter", in: "querystring", content: {} };
const QUERY = { name: "limit", in: "query" };

function use(pointer: string): { feature: "querystring"; pointer: string } {
  return { feature: "querystring", pointer };
}

describe("findUnsupportedFeatures", () => {
  it("findUnsupportedFeatures with typed 3.2 features reports nothing", () => {
    const document = {
      paths: {
        "/items": {
          query: { responses: {} },
          additionalOperations: { LOCK: { parameters: [QUERYSTRING] } },
          get: { responses: { 200: { content: { "application/jsonl": { itemSchema: {} } } } } },
        },
      },
    };

    expect(findUnsupportedFeatures(document)).toEqual([]);
  });

  it("findUnsupportedFeatures with a querystring next to a query parameter reports the querystring", () => {
    const document = { paths: { "/items": { get: { parameters: [QUERY, QUERYSTRING] } } } };

    expect(findUnsupportedFeatures(document)).toEqual([use("#/paths/~1items/get/parameters/1")]);
  });

  it("findUnsupportedFeatures merges path item parameters into each operation, once per pointer", () => {
    const document = {
      paths: {
        "/items": {
          parameters: [QUERYSTRING],
          get: { parameters: [QUERY] },
          query: { parameters: [QUERY] },
          post: {},
        },
      },
    };

    expect(findUnsupportedFeatures(document)).toEqual([use("#/paths/~1items/parameters/0")]);
  });

  it("findUnsupportedFeatures reports the operation parameter that replaces the path item one", () => {
    const document = {
      paths: { "/items": { parameters: [QUERYSTRING], get: { parameters: [QUERYSTRING, QUERY] } } },
    };

    expect(findUnsupportedFeatures(document)).toEqual([use("#/paths/~1items/get/parameters/0")]);
  });

  it("findUnsupportedFeatures follows local $refs to parameters and operations", () => {
    const document = {
      paths: { "/items": { get: { $ref: "#/components/x-operations/List" } } },
      components: {
        parameters: { Filter: QUERYSTRING },
        "x-operations": {
          List: { parameters: [{ $ref: "#/components/parameters/Filter" }, QUERY] },
        },
      },
    };

    expect(findUnsupportedFeatures(document)).toEqual([use("#/paths/~1items/get/parameters/0")]);
  });

  it("findUnsupportedFeatures reports additional operations, webhooks and path item components", () => {
    const pathItem = { additionalOperations: { LOCK: { parameters: [QUERYSTRING, QUERY] } } };
    const document = {
      webhooks: { purge: pathItem },
      components: { pathItems: { Shared: pathItem } },
    };

    expect(findUnsupportedFeatures(document)).toEqual([
      use("#/webhooks/purge/additionalOperations/LOCK/parameters/0"),
      use("#/components/pathItems/Shared/additionalOperations/LOCK/parameters/0"),
    ]);
  });

  it("findUnsupportedFeatures skips remote, broken and non-object entries", () => {
    const document = {
      paths: {
        "/a": { get: { $ref: "other.yaml#/List" } },
        "/b": { get: { parameters: [{ $ref: "#/components/parameters/Missing" }, QUERY, "text"] } },
        "/c": "text",
        "/d": { get: { parameters: "text" } },
      },
    };

    expect(findUnsupportedFeatures(document)).toEqual([]);
  });

  it("findUnsupportedFeatures with a document that is not an object reports nothing", () => {
    expect(findUnsupportedFeatures(null)).toEqual([]);
    expect(findUnsupportedFeatures({ paths: "text", components: 1 })).toEqual([]);
  });
});
