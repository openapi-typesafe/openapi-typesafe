import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, usedDocumentStrings } from "../../src/domain/config-documents.js";
import { referencedVariables, TASKFILE } from "../../src/domain/yaml-environments.js";
import { usesVariable } from "../../src/domain/yaml-generator-variables.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const dollar = (text: string): string => ["$", text].join("");

describe("referencedVariables", () => {
  it.each([
    ["{{.GEN}} a.yaml", ["GEN"]],
    [`${dollar("(gen)")} a.yaml`, ["GEN"]],
    [`${dollar("{{ env.GEN }}")} a.yaml`, ["GEN"]],
    [`${dollar("{{ variables.gen }}")} a.yaml`, ["GEN"]],
    ["npx openapi-typescript a.yaml", []],
  ])("referencedVariables of %s are %j", (text, names) => {
    expect(referencedVariables(text)).toEqual(names);
  });
});

describe("usesVariable", () => {
  it.each([
    ["{{.GEN}} a.yaml", true],
    [`${dollar("(gen)")} a.yaml`, true],
    [`${dollar("GEN")} a.yaml`, true],
    ["{{.OTHER}} a.yaml", false],
  ])("usesVariable of %s and GEN is %s", (text, expected) => {
    expect(usesVariable(text, new Set(["GEN"]))).toBe(expected);
  });
});

describe("migrateYamlCommands and variables from outside the file", () => {
  it("migrateYamlCommands reports the flags after a reference to an outside generator variable", () => {
    const text = lines("tasks:", "  a:", "    cmds:", "      - '{{.GEN}} c.yaml -it'");

    const migrated = migrateYamlCommands(text, "tasks/gen.yml", stringsOf(text), {
      ...TASKFILE,
      outsideVariables: new Set(["GEN"]),
    });

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", flags: ["-it"] }),
    ]);
  });

  it("migrateYamlCommands keeps the flags after a reference to another variable", () => {
    const text = lines("tasks:", "  a:", "    cmds:", "      - '{{.OTHER}} c.yaml -it'");

    const migrated = migrateYamlCommands(text, "tasks/gen.yml", stringsOf(text), {
      ...TASKFILE,
      outsideVariables: new Set(["GEN"]),
    });

    expect(migrated.manualSteps).toEqual([]);
  });
});
