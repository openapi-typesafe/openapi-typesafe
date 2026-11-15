import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, usedDocumentStrings } from "../../src/domain/config-documents.js";
import { COMPOSE_FILE } from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const migrateCompose = (text: string) =>
  migrateYamlCommands(text, "compose.yaml", stringsOf(text), COMPOSE_FILE);
const migrateYaml = (text: string, file: string) =>
  migrateYamlCommands(text, file, stringsOf(text));
const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

describe("migrateYamlCommands and merge keys", () => {
  it("migrateYamlCommands pairs a merged entrypoint with the service's own command", () => {
    const text = lines(
      "x-gen: &gen",
      "  image: node:22",
      '  entrypoint: ["npx", "openapi-typescript"]',
      "services:",
      "  gen:",
      "    <<: *gen",
      '    command: ["api.yaml", "-it"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands renames a merged entrypoint once for each service that merges it", () => {
    const text = lines(
      "x-gen: &gen",
      '  entrypoint: ["npx", "openapi-typescript"]',
      "services:",
      "  a:",
      "    <<: *gen",
      '    command: ["a.yaml", "-it"]',
      "  b:",
      "    <<: *gen",
      '    command: ["b.yaml", "-it"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.changes.filter((change) => change.kind === "command-renamed")).toHaveLength(1);
  });

  it("migrateYamlCommands lets the service's own entrypoint override a merged one", () => {
    const text = lines(
      "x-gen: &gen",
      '  entrypoint: ["npx", "openapi-typescript"]',
      "services:",
      "  gen:",
      "    <<: *gen",
      '    entrypoint: ["echo"]',
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toContain('command: ["api.yaml", "-it"]');
  });

  it("migrateYamlCommands lets the service's own command override a merged one", () => {
    const text = lines(
      "x-gen: &gen",
      '  entrypoint: ["npx", "openapi-typescript"]',
      '  command: ["old.yaml"]',
      "services:",
      "  gen:",
      "    <<: *gen",
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(renamed(text));
  });
  it("migrateYamlCommands pairs the service's own keys written around its merge key", () => {
    const text = lines(
      "x-gen: &gen",
      '  command: ["old.yaml"]',
      "services:",
      "  gen:",
      '    command: ["api.yaml", "-it"]',
      "    <<: *gen",
      '    entrypoint: ["npx", "openapi-typescript"]',
    );

    expect(migrateCompose(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands takes a key from the first map of a merge list", () => {
    const text = lines(
      "x-a: &a",
      '  entrypoint: ["npx", "openapi-typescript"]',
      "x-b: &b",
      '  entrypoint: ["echo"]',
      "services:",
      "  gen:",
      "    <<: [*a, *b]",
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(renamed(text));
  });
});

describe("migrateYamlCommands and Docker action arguments", () => {
  it("migrateYamlCommands renames the args of a Docker action after its entrypoint", () => {
    const text = lines(
      "name: gen",
      "runs:",
      "  using: docker",
      "  image: docker://node:22",
      "  entrypoint: npx openapi-typescript",
      '  args: ["api.yaml", "-it"]',
    );

    expect(migrateYaml(text, "action.yml").text).toBe(renamed(text));
  });

  it("migrateYamlCommands renames the args of a docker:// step after its entrypoint", () => {
    const text = lines(
      "on: push",
      "jobs:",
      "  a:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: docker://node:22",
      "        with:",
      "          entrypoint: npx",
      "          args: openapi-typescript api.yaml -it",
    );

    expect(migrateYaml(text, "ci.yml").text).toBe(renamed(text));
  });

  it("migrateYamlCommands renames the args of a Kubernetes command written after them", () => {
    const text = lines(
      "spec:",
      "  containers:",
      "    - name: gen",
      '      args: ["api.yaml", "-it"]',
      '      command: ["npx", "openapi-typescript"]',
    );

    expect(migrateYaml(text, "pod.yaml").text).toBe(renamed(text));
  });
});
