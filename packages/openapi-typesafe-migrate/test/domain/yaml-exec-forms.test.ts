import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { usedDocumentStrings } from "../../src/domain/config-documents.js";
import {
  COMPOSE_FILE,
  DEFAULT_YAML_FILE,
  type YamlCommandFile,
} from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const ESCAPED_GEN = ["$$", "GEN"].join("");

function migrated(text: string, file: string, kind: YamlCommandFile = DEFAULT_YAML_FILE) {
  const read = yaml.read(text);
  const strings = read.kind === "read" ? usedDocumentStrings(read.documents) : [];
  return migrateYamlCommands(text, file, strings, kind);
}

const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

describe("migrateYamlCommands and exec-form shells", () => {
  it("migrateYamlCommands reads the command line of an exec-form shell as shell text", () => {
    const text = lines(
      "services:",
      "  gen:",
      '    command: ["sh", "-c", "npx openapi-typescript a.yaml -it"]',
    );

    expect(migrated(text, "compose.yaml", COMPOSE_FILE).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reads Compose $$GEN as the $GEN of the service environment", () => {
    const text = lines(
      "services:",
      "  gen:",
      "    environment: { GEN: npx openapi-typescript }",
      `    command: ["sh", "-c", "${ESCAPED_GEN} a.yaml -it"]`,
      `    entrypoint: sh -c '${["$${", "GEN}"].join("")} b.yaml -it'`,
    );

    expect(migrated(text, "compose.yaml", COMPOSE_FILE).text).toBe(renamed(text));
  });

  it("migrateYamlCommands leaves $$GEN as written in a file kind without Compose escapes", () => {
    const text = lines(
      "env: { GEN: npx openapi-typescript }",
      `steps: [{ run: '${ESCAPED_GEN} a.yaml -it' }]`,
    );

    expect(migrated(text, "ci.yml").text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe"),
    );
  });

  it("migrateYamlCommands reads a Kubernetes shell command with its script in args", () => {
    const text = lines(
      "spec:",
      "  containers:",
      "    - name: gen",
      '      command: ["/bin/sh", "-c"]',
      '      args: ["npx openapi-typescript a.yaml -it"]',
    );

    expect(migrated(text, "pod.yaml").text).toBe(renamed(text));
  });

  it("migrateYamlCommands joins a Compose entrypoint and command into one command", () => {
    const text = lines(
      "services:",
      "  gen:",
      '    entrypoint: ["npx"]',
      '    command: ["openapi-typescript", "a.yaml", "-it"]',
    );

    expect(migrated(text, "compose.yaml", COMPOSE_FILE).text).toBe(renamed(text));
  });

  it("migrateYamlCommands leaves args without a command before them, and other owners apart", () => {
    const text = lines(
      "a:",
      '  args: ["openapi-typescript", "a.yaml", "-it"]',
      "b:",
      '  command: ["npx"]',
      "c:",
      '  args: ["openapi-typescript", "b.yaml", "-it"]',
    );

    expect(migrated(text, "pod.yaml").text).toBe(text);
  });

  it("migrateYamlCommands keeps a command list apart from the same path in the next document", () => {
    const text = lines('command: ["openapi-typescript"]', "---", 'command: ["-it"]');

    expect(migrated(text, "pods.yaml").text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe"),
    );
  });

  it("migrateYamlCommands rewrites an exec-form script with escapes as one value", () => {
    const text = lines(
      "services:",
      "  gen:",
      '    command: ["sh", "-c", "npx openapi-typescript \\"a b.yaml\\" -it"]',
    );

    expect(migrated(text, "compose.yaml", COMPOSE_FILE).text).toBe(renamed(text));
  });
});
