import { describe, expect, it } from "vitest";
import { findIdenticalPathTemplates } from "../../../src/domain/openapi/path-templates.js";

/** The Paths Object rule: paths that differ only in template names are identical. */

const ITEM = { get: {} };

describe("findIdenticalPathTemplates", () => {
  it("findIdenticalPathTemplates groups paths by their hierarchy, in document order", () => {
    const paths = {
      "/a/{x}": ITEM,
      "/b/{y}": ITEM,
      "/a/{z}": ITEM,
      "/b/{w}": ITEM,
      "/c/{v}": ITEM,
    };

    expect(findIdenticalPathTemplates({ paths })).toEqual([
      ["/a/{x}", "/a/{z}"],
      ["/b/{y}", "/b/{w}"],
    ]);
  });

  it("findIdenticalPathTemplates leaves out extension keys and paths without templates", () => {
    const paths = { "x-{a}": ITEM, "x-{b}": ITEM, "/a": ITEM, "/a/{id}": ITEM };

    expect(findIdenticalPathTemplates({ paths })).toEqual([]);
  });

  it("findIdenticalPathTemplates without a paths object finds nothing", () => {
    expect(findIdenticalPathTemplates(null)).toEqual([]);
    expect(findIdenticalPathTemplates({ paths: [] })).toEqual([]);
  });
});
