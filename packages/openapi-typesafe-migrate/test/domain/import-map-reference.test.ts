import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { importMapLocation, importMapSteps } from "../../src/domain/import-map-reference.js";

describe("importMapLocation", () => {
  it.each([
    ["deno.json", "./deps.json", "deps.json"],
    ["deno.json", "deps.json", "deps.json"],
    ["app/deno.jsonc", "../maps//deps.json", "maps/deps.json"],
    ["a/b/deno.json", "./../c/./m.json", "a/c/m.json"],
  ])("importMapLocation resolves %s naming %s to %s", (config, reference, path) => {
    expect(importMapLocation(config, reference)).toEqual({ kind: "in-project", path });
  });

  it.each([
    ["deno.json", "../deps.json"],
    ["app/deno.json", "../../deps.json"],
    ["deno.json", "https://example.com/deps.json"],
    ["deno.json", "file:///srv/deps.json"],
    ["deno.json", "/srv/deps.json"],
    ["deno.json", "."],
  ])("importMapLocation finds %s naming %s not editable", (config, reference) => {
    expect(importMapLocation(config, reference)).toEqual({ kind: "not-editable", reference });
  });
});

describe("importMapSteps", () => {
  it("importMapSteps reports only the import maps the tool cannot edit", () => {
    const read = createJsonTextReader().read(
      '{ "importMap": "../x.json", "nested": { "importMap": "https://a.b/m.json" } }',
    );
    const named = createJsonTextReader().read('{ "importMap": "./deps.json" }');

    const steps = importMapSteps("deno.json", read);

    expect(steps).toEqual([{ kind: "import-map-not-editable", reference: "../x.json" }]);
    expect(importMapSteps("deno.json", named)).toEqual([]);
    expect(importMapSteps("deno.json", { kind: "unreadable", offset: 0 })).toEqual([]);
  });
});
