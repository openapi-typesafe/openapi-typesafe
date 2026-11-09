import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { catalogOfSpec } from "../../src/domain/catalog-plan.js";
import { planCatalogs } from "../../src/domain/catalogs.js";
import { isMap, type TreeMap } from "../../src/domain/config-documents.js";

const json = createJsonTextReader();
const yaml = createYamlTextReader();

function rootOf(read: ReturnType<typeof yaml.read>): TreeMap {
  const root = read.kind === "read" ? read.documents.find(isMap) : undefined;
  if (root === undefined) {
    throw new Error("the test document has no map at its root");
  }
  return root;
}

const manifest = (value: unknown): TreeMap => rootOf(json.read(JSON.stringify(value)));
const workspace = (lines: readonly string[]): TreeMap => rootOf(yaml.read(lines.join("\n")));

describe("catalogOfSpec", () => {
  it.each([
    ["catalog:", "default"],
    ["catalog:legacy", "legacy"],
    ["^0.13.0", undefined],
    ["workspace:*", undefined],
  ])("catalogOfSpec reads %s as %s", (spec, catalog) => {
    expect(catalogOfSpec(spec)).toBe(catalog);
  });
});

describe("planCatalogs", () => {
  it("planCatalogs keeps an entry that a colliding dependency keeps using", () => {
    const manifests = [
      manifest({ dependencies: { "openapi-fetch": "catalog:", "openapi-typesafe-fetch": "^1" } }),
    ];
    const catalogFiles = [workspace(["catalog:", "  openapi-fetch: ^0.13.0"])];

    const plan = planCatalogs({ manifests, catalogFiles });

    expect(plan.inUse.has("default", "openapi-fetch")).toBe(true);
    expect(plan.kept.has("default", "openapi-fetch")).toBe(true);
  });

  it("planCatalogs keeps the entries that overrides point at", () => {
    const manifests = [
      manifest({ resolutions: { "**/openapi-typescript": "catalog:legacy" } }),
      manifest({ overrides: { app: { "openapi-react-query": "catalog:" } } }),
      manifest({ pnpm: { overrides: { "a>openapi-typescript-helpers": "catalog:" } } }),
    ];
    const catalogFiles = [
      workspace([
        "catalog:",
        "  openapi-fetch: ^0.13.0",
        "  openapi-react-query: ^0.5.0",
        "  openapi-typescript-helpers: ^0.0.15",
        "catalogs:",
        "  legacy: { openapi-typescript: ^7.0.0 }",
        "overrides:",
        '  openapi-fetch: "catalog:"',
      ]),
    ];

    const plan = planCatalogs({ manifests, catalogFiles });

    for (const [catalog, name] of [
      ["default", "openapi-fetch"],
      ["default", "openapi-react-query"],
      ["default", "openapi-typescript-helpers"],
      ["legacy", "openapi-typescript"],
    ] as const) {
      expect(plan.kept.has(catalog, name)).toBe(true);
    }
  });

  it("planCatalogs keeps entries whose value the tool does not edit", () => {
    const catalogFiles = [
      workspace([
        "x: &v ^0.13.0",
        "catalog:",
        "  openapi-fetch: *v",
        "  openapi-typescript: { }",
        "  openapi-react-query: ^0.5.0",
        "catalogs:",
        "  legacy: { openapi-typescript-helpers: { } }",
      ]),
    ];

    const plan = planCatalogs({ manifests: [], catalogFiles });

    expect(plan.kept.has("default", "openapi-fetch")).toBe(true);
    expect(plan.kept.has("default", "openapi-typescript")).toBe(true);
    expect(plan.kept.has("default", "openapi-react-query")).toBe(false);
    expect(plan.kept.has("legacy", "openapi-typescript-helpers")).toBe(true);
  });

  it("planCatalogs keeps nothing when the catalog already has the new name", () => {
    const catalogFiles = [
      workspace(["catalog:", "  openapi-fetch: *v", "  openapi-typesafe-fetch: ^1.0.0"]),
    ];

    const plan = planCatalogs({ manifests: [], catalogFiles });

    expect(plan.kept.has("default", "openapi-fetch")).toBe(false);
  });

  it("planCatalogs reads bun catalogs of manifests, also under workspaces", () => {
    const manifests = [
      manifest({
        dependencies: { "openapi-fetch": "catalog:old", "openapi-typesafe-fetch": "workspace:*" },
        workspaces: { catalogs: { old: { "openapi-fetch": "^0.13.0" } } },
      }),
    ];

    const plan = planCatalogs({ manifests, catalogFiles: [] });

    expect(plan.inUse.has("old", "openapi-fetch")).toBe(true);
    expect(plan.kept.has("old", "openapi-fetch")).toBe(true);
    expect(plan.kept.has("default", "openapi-fetch")).toBe(false);
  });

  it("planCatalogs keeps nothing for a plain catalog and plain dependencies", () => {
    const manifests = [manifest({ dependencies: { "openapi-fetch": "catalog:" } })];
    const catalogFiles = [workspace(["catalog:", "  openapi-fetch: ^0.13.0"])];

    const plan = planCatalogs({ manifests, catalogFiles });

    expect(plan.inUse.has("default", "openapi-fetch")).toBe(false);
    expect(plan.kept.has("default", "openapi-fetch")).toBe(false);
  });
});
