import { describe, expect, it } from "vitest";
import { findUnsupportedFeatures } from "../../../src/domain/openapi/unsupported-features.js";

const RESPONSE_WITH_STREAM = {
  responses: {
    "200": { description: "ok", content: { "application/jsonl": { itemSchema: {} } } },
  },
};

describe("findUnsupportedFeatures", () => {
  it("findUnsupportedFeatures with a query operation reports its path item", () => {
    const document = { paths: { "/items": { query: { responses: {} } } } };

    expect(findUnsupportedFeatures(document)).toEqual([
      { feature: "query", pointer: "#/paths/~1items" },
    ]);
  });

  it("findUnsupportedFeatures with additionalOperations reports webhooks and path item components", () => {
    const document = {
      webhooks: { purge: { additionalOperations: {} } },
      components: { pathItems: { Shared: { additionalOperations: {} } } },
    };

    expect(findUnsupportedFeatures(document)).toEqual([
      { feature: "additionalOperations", pointer: "#/webhooks/purge" },
      { feature: "additionalOperations", pointer: "#/components/pathItems/Shared" },
    ]);
  });

  it("findUnsupportedFeatures with an itemSchema reports its media type", () => {
    const document = { paths: { "/s": { get: RESPONSE_WITH_STREAM } } };

    expect(findUnsupportedFeatures(document)).toEqual([
      {
        feature: "itemSchema",
        pointer: "#/paths/~1s/get/responses/200/content/application~1jsonl",
      },
    ]);
  });

  it("findUnsupportedFeatures looks into parameter arrays", () => {
    const parameter = { name: "f", in: "query", content: { "text/plain": { itemSchema: {} } } };
    const document = { paths: { "/p": { get: { parameters: [parameter] } } } };

    expect(findUnsupportedFeatures(document)).toEqual([
      { feature: "itemSchema", pointer: "#/paths/~1p/get/parameters/0/content/text~1plain" },
    ]);
  });

  it("findUnsupportedFeatures with an in: querystring parameter reports the parameter", () => {
    const parameter = { name: "filter", in: "querystring", content: {} };
    const document = { components: { parameters: { Filter: parameter } } };

    expect(findUnsupportedFeatures(document)).toEqual([
      { feature: "querystring", pointer: "#/components/parameters/Filter" },
    ]);
  });

  it("findUnsupportedFeatures ignores schemas, examples and extensions named like the features", () => {
    const content = { "application/json": { itemSchema: {} } };
    const schema = { type: "object", properties: { content: { properties: content } } };
    const document = {
      components: { schemas: { Stream: schema }, examples: { E: { value: { content } } } },
      paths: { "/x": { "x-meta": { content }, get: { responses: {} } } },
    };

    expect(findUnsupportedFeatures(document)).toEqual([]);
  });

  it("findUnsupportedFeatures with a document that is not an object reports nothing", () => {
    expect(findUnsupportedFeatures(null)).toEqual([]);
    expect(findUnsupportedFeatures({ paths: "text", components: 1 })).toEqual([]);
  });
});
