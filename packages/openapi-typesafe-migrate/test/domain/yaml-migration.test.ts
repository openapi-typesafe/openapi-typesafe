import { describe, expect, it } from "vitest";
import {
  migrateDependabotConfig,
  migrateYamlCommands,
  migrateYamlScripts,
} from "../../src/domain/yaml-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("migrateYamlCommands", () => {
  it("migrateYamlCommands migrates commands and leaves other values", () => {
    const text = lines(
      "info:",
      "  description: Types are generated with openapi-typescript -it",
      "jobs:",
      "  gen:",
      "    steps:",
      "      - run: |",
      "          npx openapi-typescript ./api.yaml \\",
      "            --immutable-types",
      "      - run: npx openapi-typescript api.yaml --redoc=r.yaml",
    );

    const migrated = migrateYamlCommands(text, "ci.yml");

    expect(migrated.text).toBe(
      text
        .replaceAll("npx openapi-typescript", "npx openapi-typesafe")
        .replace("--immutable-types", "--immutable")
        .replace("--redoc=", "--redocly="),
    );
    expect(migrated.changes.map((change) => ("location" in change ? change.location : ""))).toEqual(
      ["ci.yml:7", "ci.yml:8", "ci.yml:9", "ci.yml:9"],
    );
  });

  it("migrateYamlCommands reads a folded scalar as one command and keeps its line breaks", () => {
    const text = lines("script: >", "  openapi-typescript a", "  -it");

    const migrated = migrateYamlCommands(text, "x.yml");

    expect(migrated.text).toBe(lines("script: >", "  openapi-typesafe a", "  --immutable"));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands reports a pinned command", () => {
    const migrated = migrateYamlCommands("command: npx openapi-typescript@7 a\n", "compose.yml");

    expect(migrated.manualSteps).toEqual([
      { kind: "versioned-command", location: "compose.yml:1" },
    ]);
  });
});

describe("migrateYamlScripts", () => {
  it("migrateYamlScripts migrates the scripts of package.yaml by script name", () => {
    const text = lines(
      "dependencies:",
      "  openapi-fetch: ^0.13.0",
      "scripts:",
      "  gen: openapi-typescript a -it",
    );

    const migrated = migrateYamlScripts(text);

    expect(migrated.text).toBe(
      text.replace("openapi-typescript a -it", "openapi-typesafe a --immutable"),
    );
    expect(migrated.changes[0]).toEqual({ kind: "command-renamed", location: "scripts.gen" });
    expect(migrated.manualSteps).toEqual([]);
  });
});

describe("migrateDependabotConfig", () => {
  it("migrateDependabotConfig renames every original package it names", () => {
    const text = lines(
      "updates:",
      "  - ignore:",
      '      - dependency-name: "openapi-typescript"',
      "      - dependency-name: openapi-fetch",
      "      - dependency-name: zod",
      "    groups:",
      "      api:",
      "        patterns:",
      "          - openapi-react-query",
      "          - 'openapi-*'",
    );

    const migrated = migrateDependabotConfig(text, ".github/dependabot.yml");

    expect(migrated.text).toBe(
      text
        .replace('"openapi-typescript"', '"openapi-typesafe"')
        .replace("name: openapi-fetch", "name: openapi-typesafe-fetch")
        .replace("- openapi-react-query", "- openapi-typesafe-react-query"),
    );
    expect(migrated.changes).toEqual([
      {
        kind: "package-name-renamed",
        location: ".github/dependabot.yml:3",
        from: "openapi-typescript",
        to: "openapi-typesafe",
      },
      {
        kind: "package-name-renamed",
        location: ".github/dependabot.yml:4",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
      {
        kind: "package-name-renamed",
        location: ".github/dependabot.yml:9",
        from: "openapi-react-query",
        to: "openapi-typesafe-react-query",
      },
    ]);
  });
});
