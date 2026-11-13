import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { yamlCommandFileFor } from "../../src/application/yaml-file-kinds.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import {
  AZURE_PIPELINES_FILE,
  DEFAULT_YAML_FILE,
  GITLAB_CI_FILE,
  type YamlCommandFile,
} from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const dollar = (text: string): string => ["$", text].join("");
const FILE = "azure-pipelines.yml";

const migrated = (text: string, kind: YamlCommandFile = AZURE_PIPELINES_FILE) =>
  migrateYamlCommands(text, FILE, stringsOf(text), kind);

const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

describe("migrateYamlCommands and Azure Pipelines variables", () => {
  it("migrateYamlCommands migrates a variable map and the macros, expressions and $NAME", () => {
    const text = lines(
      "variables:",
      "  gen: npx openapi-typescript",
      "steps:",
      `  - script: ${dollar("(gen)")} a.yaml -it`,
      `  - bash: ${dollar("{{ variables.gen }}")} b.yaml -it`,
      `  - script: ${dollar("GEN")} c.yaml -it && ${dollar("{GEN}")} d.yaml -it`,
    );

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reads the name and value of a list item in either order", () => {
    const text = lines(
      "variables:",
      "  - group: shared-secrets",
      "  - name: gen",
      "    value: openapi-typescript",
      "  - { value: openapi-typescript, readonly: true, name: build.gen }",
      "  - template: vars.yml",
      "steps:",
      `  - script: ${dollar("(gen)")} a.yaml -it && ${dollar("BUILD_GEN")} b.yaml -it`,
      `  - script: ${dollar("(build.gen)")} c.yaml -it`,
    );

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands takes the name of the item, not a name below it", () => {
    const text = lines(
      "variables:",
      "  - { value: openapi-typescript, meta: { name: other }, name: gen }",
      `steps: [{ script: '${dollar("(gen)")} a.yaml -it' }]`,
    );

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reads a step env list as variables, not as steps", () => {
    const text = lines(
      "steps:",
      `  - script: ${dollar("GEN")} a.yaml -it`,
      "    env: [{ name: GEN, value: openapi-typescript }]",
    );

    const result = migrated(text);

    expect(result.text).toBe(renamed(text));
    expect(result.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands reads a macro in a variable value, also with an escape", () => {
    const text = lines(
      'variables: { tool: openapi-typescript, gen: "\\t$(tool)", run: "$(tool)" }',
      `steps: [{ script: '${dollar("(gen)")} a.yaml -it; ${dollar("(run)")} b.yaml -it' }]`,
    );

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands leaves a macro of a name the file does not set to the shell", () => {
    const text = lines(
      "variables: { gen: openapi-typescript }",
      "steps:",
      "  - script: |",
      "      DATE='npx openapi-typescript'",
      `      ${dollar("(date)")} a.yaml -it`,
    );

    expect(migrated(text).text).toBe(text.replaceAll("openapi-typescript", "openapi-typesafe"));
  });

  it("migrateYamlCommands reads a step env by the name as written", () => {
    const text = lines(
      "steps:",
      "  - script: $gen a.yaml -it",
      "    env: { gen: openapi-typescript }",
    );

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands leaves Azure variables and macros of another file kind", () => {
    const text = lines(
      "variables:",
      "  - name: gen",
      "    value: openapi-typescript",
      `script: [${dollar("(gen)")} a.yaml -it]`,
    );

    expect(migrated(text, GITLAB_CI_FILE).text).toBe(text);
  });
});

describe("migrateYamlCommands and Kubernetes env items", () => {
  it("migrateYamlCommands reports an env item that names an old package", () => {
    const text = lines(
      "spec:",
      "  containers:",
      "    - command: [sh, -c, '$(GEN) api.yaml']",
      "      env:",
      "        - name: GEN",
      "          value: npx openapi-typescript",
      "        - name: PORT",
      "          value: '8080'",
    );

    const result = migrated(text, DEFAULT_YAML_FILE);

    expect(result.text).toBe(text);
    expect(result.manualSteps).toEqual([
      { kind: "old-name-in-command", location: `${FILE}:6`, word: "npx openapi-typescript" },
    ]);
  });

  it("migrateYamlCommands leaves the value key of other lists alone", () => {
    const text = lines(
      "labels:",
      "  - name: tool",
      "    value: openapi-typescript",
      "env: { tool: { value: openapi-typescript } }",
    );

    expect(migrated(text, DEFAULT_YAML_FILE).manualSteps).toEqual([]);
  });
});

describe("yamlCommandFileFor and Azure Pipelines", () => {
  it.each([
    "azure-pipelines.yml",
    "apps/api/azure-pipelines.yaml",
    "ci.azure-pipelines.yml",
    "azure-pipelines-release.yml",
    ".azure-pipelines/gen.yml",
    "apps/api/.azuredevops/build.yaml",
  ])("yamlCommandFileFor reads %s as an Azure Pipelines file", (path) => {
    expect(yamlCommandFileFor(path)).toBe(AZURE_PIPELINES_FILE);
  });

  it.each(["my-azure-pipelinesx.yml", "azure-pipelines.json", "docs/azure-pipelines/x.yml"])(
    "yamlCommandFileFor reads %s as another file",
    (path) => {
      expect(yamlCommandFileFor(path)).toBe(DEFAULT_YAML_FILE);
    },
  );
});
