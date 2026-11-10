import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { namedImportMaps, withNamedImportMaps } from "../../src/application/named-import-maps.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";

const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };

describe("namedImportMaps", () => {
  it("namedImportMaps gives each import map in the project with the configs that name it", async () => {
    const files = new InMemoryProjectFiles({
      "a/deno.json": '{ "importMap": "../deps.json" }',
      "b/deno.jsonc": '{ "importMap": "../deps.json" } // shared',
      "c/deno.json": '{ "importMap": "https://example.com/deps.json" }',
      "d/deno.json": "{ broken",
      "e/other.json": '{ "importMap": "./x.json" }',
    });
    const paths = (await files.listFiles()).files;

    const named = await namedImportMaps(paths, files, readers);

    expect([...named]).toEqual([["deps.json", ["a/deno.json", "b/deno.jsonc"]]]);
  });
});

describe("withNamedImportMaps", () => {
  const importMaps = new Map([["maps/deps.json", ["app/deno.json"]]]);

  it("withNamedImportMaps gives the names of a named map to the configs that name it", () => {
    const declarations = [
      { path: "app/deno.json", names: new Set(["a"]) },
      { path: "maps/deps.json", names: new Set(["b"]) },
      { path: "package.json", names: new Set(["c"]) },
    ];

    expect(withNamedImportMaps(declarations, importMaps)).toEqual([
      { path: "app/deno.json", names: new Set(["a", "b"]) },
      { path: "package.json", names: new Set(["c"]) },
    ]);
  });

  it("withNamedImportMaps lets a config declare every package when its map is unreadable", () => {
    const declarations = [
      { path: "app/deno.json", names: new Set(["a"]) },
      { path: "maps/deps.json", names: undefined },
    ];

    expect(withNamedImportMaps(declarations, importMaps)).toEqual([
      { path: "app/deno.json", names: undefined },
    ]);
  });

  it("withNamedImportMaps keeps the names of a config whose map is not in the project", () => {
    const declarations = [{ path: "app/deno.json", names: new Set(["a"]) }];

    expect(withNamedImportMaps(declarations, importMaps)).toEqual(declarations);
  });
});
