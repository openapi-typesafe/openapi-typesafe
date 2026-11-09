import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { isMap } from "../../src/domain/config-documents.js";
import {
  importMapNames,
  migrateImportMap as migrateTree,
} from "../../src/domain/import-map-migration.js";

const reader = createJsonTextReader();

const migrateImportMap = (text: string, version: string) =>
  migrateTree(text, reader.read(text), version);

describe("migrateImportMap", () => {
  it("migrateImportMap renames the keys and npm values of imports, in place", () => {
    const text = [
      "{",
      "  // Deno reads JSONC",
      '  "imports": {',
      '    "openapi-fetch": "npm:openapi-fetch@^0.13.0",',
      '    "openapi-fetch/": "npm:/openapi-fetch@0.13.1/",',
      '    "fetch": "npm:openapi-fetch@0.13",',
      '    "std/": "jsr:@std/",',
      "  },",
      '  "tasks": { "gen": "deno run -A npm:openapi-typescript api.yaml" }',
      "}",
    ].join("\n");

    const migrated = migrateImportMap(text, "1.0.0");

    expect(migrated.text).toBe(
      text
        .replace(
          '"openapi-fetch": "npm:openapi-fetch@^0.13.0"',
          '"openapi-typesafe-fetch": "npm:openapi-typesafe-fetch@^1.0.0"',
        )
        .replace(
          '"openapi-fetch/": "npm:/openapi-fetch@0.13.1/"',
          '"openapi-typesafe-fetch/": "npm:/openapi-typesafe-fetch@1.0.0/"',
        )
        .replace(
          '"fetch": "npm:openapi-fetch@0.13"',
          '"fetch": "npm:openapi-typesafe-fetch@~1.0.0"',
        ),
    );
    expect(migrated.changes).toEqual([
      {
        kind: "import-renamed",
        field: "imports",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
        target: "npm:openapi-typesafe-fetch@^1.0.0",
      },
      {
        kind: "import-renamed",
        field: "imports",
        from: "openapi-fetch/",
        to: "openapi-typesafe-fetch/",
        target: "npm:/openapi-typesafe-fetch@1.0.0/",
      },
      {
        kind: "alias-renamed",
        field: "imports",
        name: "fetch",
        spec: "npm:openapi-typesafe-fetch@~1.0.0",
      },
    ]);
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateImportMap renames a key whose URL it keeps, and reports the URL", () => {
    const text = JSON.stringify({
      scopes: { "./legacy/": { "openapi-fetch": "https://esm.sh/openapi-fetch@0.13" }, odd: 1 },
    });

    const migrated = migrateImportMap(text, "1.0.0");

    expect(JSON.parse(migrated.text)).toEqual({
      scopes: {
        "./legacy/": { "openapi-typesafe-fetch": "https://esm.sh/openapi-fetch@0.13" },
        odd: 1,
      },
    });
    expect(migrated.manualSteps).toEqual([
      {
        kind: "spec-kept",
        name: "openapi-typesafe-fetch",
        spec: "https://esm.sh/openapi-fetch@0.13",
      },
    ]);
    expect(migrated.changes).toEqual([
      expect.objectContaining({ kind: "import-renamed", field: "scopes../legacy/" }),
    ]);
  });

  it("migrateImportMap reports a config that does not parse, and leaves an empty one", () => {
    expect(migrateImportMap('{ "openapi-fetch": ', "1.0.0").manualSteps).toEqual([
      { kind: "config-unreadable", position: { line: 1, column: 19 } },
    ]);
    expect(migrateImportMap("", "1.0.0")).toEqual({ text: "", changes: [], manualSteps: [] });
  });
});

describe("importMapNames", () => {
  it("importMapNames gives the package of every key of imports and scopes", () => {
    const read = reader.read(
      JSON.stringify({
        imports: { a: "npm:a", "b/": "npm:b/", "c/x": "npm:c/x", "@s/d/e": "npm:@s/d/e" },
        scopes: { "./x/": { f: "npm:f" } },
      }),
    );
    const roots = read.kind === "read" ? read.documents.filter(isMap) : [];

    expect(roots.flatMap(importMapNames)).toEqual(["a", "b", "c", "@s/d", "f"]);
  });
});
