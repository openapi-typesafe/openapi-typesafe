import { describe, expect, it } from "vitest";
import { migrateCommand, migrateCommandLines } from "../../src/domain/command-migration.js";

describe("migrateCommand", () => {
  it("migrateCommand renames the generator command after shell punctuation", () => {
    const migrated = migrateCommand(
      "npx openapi-typescript a.yaml -o b.ts && (openapi-typescript c)",
      "scripts.gen",
    );

    expect(migrated.text).toBe("npx openapi-typesafe a.yaml -o b.ts && (openapi-typesafe c)");
    expect(migrated.changes).toEqual([
      { kind: "command-renamed", location: "scripts.gen" },
      { kind: "command-renamed", location: "scripts.gen" },
    ]);
  });

  it("migrateCommand leaves paths and the helpers package alone", () => {
    const text =
      "node node_modules/openapi-typescript/bin/cli.js && echo openapi-typescript-helpers";

    expect(migrateCommand(text, "x")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateCommand renames the renamed flags of the migrated command", () => {
    const migrated = migrateCommand(
      "openapi-typescript a.yaml -it --support-array-length --redoc=r.yaml -ap",
      "scripts.gen",
    );

    expect(migrated.text).toBe(
      "openapi-typesafe a.yaml --immutable --array-length --redocly=r.yaml --additional-properties",
    );
    expect(migrated.changes.filter((change) => change.kind === "flag-renamed")).toHaveLength(4);
  });

  it("migrateCommand leaves the flags of other commands alone", () => {
    const text = "other-tool --redoc x";

    expect(migrateCommand(text, "x").text).toBe(text);
  });

  it("migrateCommand reports a command pinned to a version", () => {
    const migrated = migrateCommand("npx openapi-typescript@7 a.yaml", "ci.yml:3");

    expect(migrated.text).toBe("npx openapi-typescript@7 a.yaml");
    expect(migrated.manualSteps).toEqual([{ kind: "versioned-command", location: "ci.yml:3" }]);
  });
});

describe("migrateCommandLines", () => {
  it("migrateCommandLines names each change by file and line", () => {
    const migrated = migrateCommandLines("set -e\nopenapi-typescript a.yaml\n", "gen.sh");

    expect(migrated.text).toBe("set -e\nopenapi-typesafe a.yaml\n");
    expect(migrated.changes).toEqual([{ kind: "command-renamed", location: "gen.sh:2" }]);
  });

  it("migrateCommandLines collects manual steps of every line", () => {
    const migrated = migrateCommandLines("npx openapi-typescript@6 a\n", "Makefile");

    expect(migrated.manualSteps).toEqual([{ kind: "versioned-command", location: "Makefile:1" }]);
  });
});
