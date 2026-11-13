import { describe, expect, it } from "vitest";
import { resolveDocumentRef } from "../../src/api/document-refs.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/** `resolveDocumentRef`: a pointer read as the generated types index it (ADR-026). */

const STRING = { type: "string" };

const DOCUMENT = {
  components: {
    schemas: {
      Base: { type: "object", properties: { v: STRING } },
      Wrap: {
        type: "object",
        properties: {
          o: { $ref: "#/components/schemas/Base" },
          s: { $ref: "#/components/schemas/Base", description: "Own" },
          loop: { $ref: "#/components/schemas/Loop/properties/x" },
        },
      },
      Loop: { $ref: "#/components/schemas/Wrap/properties/loop" },
      Self: { $ref: "#/components/schemas/Self/properties/a" },
      Closed: { type: "array", items: false, unevaluatedProperties: false },
      ClosedRef: { $ref: "#/components/schemas/Base", additionalProperties: false },
    },
  },
};

function resolve(ref: string) {
  const logger = new RecordingLogger();
  const node = resolveDocumentRef(DOCUMENT, ref, { silent: false, logger });
  return { node, warnings: logger.messages("warn") };
}

describe("resolveDocumentRef", () => {
  it("resolveDocumentRef reads a pointer through a $ref on its way", () => {
    expect(resolve("#/components/schemas/Wrap/properties/o/properties/v")).toEqual({
      node: STRING,
      warnings: [],
    });
  });

  it("resolveDocumentRef resolves a false schema without a warning", () => {
    expect(resolve("#/components/schemas/Closed/items")).toEqual({ node: false, warnings: [] });
    expect(resolve("#/components/schemas/Closed/unevaluatedProperties").node).toBe(false);
  });

  it("resolveDocumentRef reads a false sibling of a $ref from the node itself", () => {
    expect(resolve("#/components/schemas/ClosedRef/additionalProperties")).toEqual({
      node: false,
      warnings: [],
    });
  });

  it("resolveDocumentRef reads a sibling of a $ref from the node itself", () => {
    expect(resolve("#/components/schemas/Wrap/properties/s/description").node).toBe("Own");
  });

  it("resolveDocumentRef with a key in neither the node nor its target warns REF_NOT_FOUND", () => {
    const { node, warnings } = resolve("#/components/schemas/Wrap/properties/o/properties/w");

    expect(node).toBeUndefined();
    expect(warnings).toEqual([
      'Could not resolve $ref "#/components/schemas/Wrap/properties/o/properties/w" (REF_NOT_FOUND)',
    ]);
  });

  it("resolveDocumentRef through a circular $ref on its way ends with a warning", () => {
    const { node, warnings } = resolve("#/components/schemas/Loop/properties/x/properties/v");

    expect(node).toBeUndefined();
    expect(warnings.at(-1)).toContain("(REF_NOT_FOUND)");
  });

  it("resolveDocumentRef through a $ref to a place inside itself ends with a warning", () => {
    const { node, warnings } = resolve("#/components/schemas/Self/properties/a");

    expect(node).toBeUndefined();
    expect(warnings.at(-1)).toContain("(REF_NOT_FOUND)");
  });
});
