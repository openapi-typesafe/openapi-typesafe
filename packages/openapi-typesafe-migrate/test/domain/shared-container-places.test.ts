import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { usedDocumentValues } from "../../src/domain/config-documents.js";
import { COMPOSE_FILE } from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const newName = (text: string): string => text.replaceAll("openapi-typescript", "openapi-typesafe");

function migrateCompose(text: string) {
  const read = yaml.read(text);
  const values = read.kind === "read" ? usedDocumentValues(read.documents) : [];
  return migrateYamlCommands(text, "compose.yaml", values, COMPOSE_FILE);
}

const SHARED_FLAG_STEP = {
  kind: "shared-container-text",
  location: "compose.yaml:2",
  renames: [{ from: "-it", to: "--immutable" }],
};

describe("migrateYamlCommands and text that an anchor gives to several containers", () => {
  it("migrateYamlCommands reports a merged command that a generator and grep both run", () => {
    const text = lines(
      "x-args: &args",
      '  command: ["-it", "a.txt"]',
      "services:",
      "  gen:",
      "    <<: *args",
      '    entrypoint: ["npx", "openapi-typescript"]',
      "  search:",
      "    <<: *args",
      '    entrypoint: ["grep"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(newName(text));
    expect(migrated.manualSteps).toEqual([SHARED_FLAG_STEP]);
  });

  it("migrateYamlCommands reports an aliased command that a generator and grep both run", () => {
    const text = lines(
      "services:",
      '  gen: { entrypoint: ["npx", "openapi-typescript"], command: &args ["-it", "a.txt"] }',
      '  search: { entrypoint: ["grep"], command: *args }',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(newName(text));
    expect(migrated.manualSteps).toEqual([SHARED_FLAG_STEP]);
  });

  it("migrateYamlCommands renames a merged command part that only a generator runs", () => {
    const text = lines(
      "x-args: &args",
      '  command: ["-it", "a.txt"]',
      "services:",
      "  gen:",
      "    <<: *args",
      '    entrypoint: ["npx", "openapi-typescript"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(newName(text).replace("-it", "--immutable"));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands counts the anchor's own map when it is a whole container", () => {
    const text = lines(
      "x-search: &search",
      '  command: ["-it", "a.txt"]',
      '  entrypoint: ["grep"]',
      "services:",
      "  gen:",
      "    <<: *search",
      '    entrypoint: ["npx", "openapi-typescript"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(newName(text));
    expect(migrated.manualSteps).toEqual([SHARED_FLAG_STEP]);
  });

  it("migrateYamlCommands renames a merged command that every container runs the same way", () => {
    const text = lines(
      "x-args: &args",
      '  command: ["-it", "a.txt"]',
      "services:",
      "  a:",
      "    <<: *args",
      '    entrypoint: ["npx", "openapi-typescript"]',
      "  b:",
      "    <<: *args",
      '    entrypoint: ["npx", "openapi-typescript"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(newName(text).replace("-it", "--immutable"));
    expect(migrated.changes.filter((change) => change.kind === "flag-renamed")).toHaveLength(1);
  });

  it("migrateYamlCommands reads a merged command part as the maps that merge it run it", () => {
    const text = lines(
      "x-args: &args",
      '  command: ["openapi-typescript", "-it"]',
      "services:",
      "  echo:",
      "    <<: *args",
      '    entrypoint: ["sh", "-c", "echo \\"$0\\""]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "compose.yaml:2", word: "openapi-typescript" },
    ]);
  });

  it("migrateYamlCommands keeps the steps of a shared command that no reading edits", () => {
    const text = lines(
      "x-args: &args",
      '  command: ["openapi-typescript@7", "a.yaml"]',
      "services:",
      "  gen:",
      "    <<: *args",
      '    entrypoint: ["npx"]',
      "  echo:",
      "    <<: *args",
      '    entrypoint: ["sh", "-c", "echo \\"$0\\""]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "versioned-command", location: "compose.yaml:2" },
      { kind: "old-name-in-command", location: "compose.yaml:2", word: "openapi-typescript@7" },
    ]);
  });

  it("migrateYamlCommands reports nothing for a merged command that no reading changes", () => {
    const text = lines(
      "x-args: &args",
      '  command: ["-it", "a.txt"]',
      "services:",
      "  search:",
      "    <<: *args",
      '    entrypoint: ["grep"]',
      "  other:",
      "    <<: *args",
      '    entrypoint: ["sh", "-c", "exec \\"$@\\"", "--"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(newName(text));
    expect(migrated.manualSteps).toEqual([]);
  });
});
