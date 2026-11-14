import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
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

const migrated = (text: string, file: string, kind: YamlCommandFile) =>
  migrateYamlCommands(text, file, stringsOf(text), kind);

const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

const notOnlyGenerator = (location: string, variable: string) => ({
  kind: "variable-not-only-generator",
  location,
  variable,
  flags: ["-it"],
});

describe("migrateYamlCommands and GitLab variable options", () => {
  it("migrateYamlCommands renames the options of a GitLab variable with its value", () => {
    const text = lines(
      "variables:",
      "  GEN:",
      '    value: "npx openapi-typescript"',
      '    options: ["npx openapi-typescript", "npx openapi-typescript --immutable"]',
      '    description: "Runs openapi-typescript"',
      "gen:",
      `  script: [${dollar("GEN")} api.yaml -it]`,
    );

    const result = migrated(text, ".gitlab-ci.yml", GITLAB_CI_FILE);

    expect(result.text).toBe(
      renamed(text).replace("Runs openapi-typesafe", "Runs openapi-typescript"),
    );
    expect(result.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands reports the flags after a variable whose option runs another tool", () => {
    const text = lines(
      "variables:",
      "  GEN: { value: npx openapi-typescript, options: [npx openapi-typescript, mytool] }",
      `gen: { script: [${dollar("GEN")} api.yaml -it] }`,
    );

    const result = migrated(text, ".gitlab-ci.yml", GITLAB_CI_FILE);

    expect(result.text).toBe(text.replaceAll("openapi-typescript", "openapi-typesafe"));
    expect(result.manualSteps).toEqual([notOnlyGenerator(".gitlab-ci.yml:3", dollar("GEN"))]);
  });

  it("migrateYamlCommands reads options only under a named variable of a GitLab file", () => {
    const texts = [
      lines("variables: [{ options: [npx openapi-typescript] }]"),
      lines("gen: { tool: { options: [npx openapi-typescript] } }"),
      lines("variables: { GEN: { options: { first: npx openapi-typescript } } }"),
    ];
    const other = lines("env: { GEN: { options: [npx openapi-typescript] } }");

    for (const text of texts) {
      expect(migrated(text, ".gitlab-ci.yml", GITLAB_CI_FILE).text).toBe(text);
    }
    expect(migrated(other, "ci.yml", DEFAULT_YAML_FILE).text).toBe(other);
  });
});

describe("migrateYamlCommands and the scope of a variable map", () => {
  it("migrateYamlCommands gives an Azure step env to its own step only", () => {
    const text = lines(
      "steps:",
      `  - script: ${dollar("GEN4")} k.yaml -it`,
      "    env:",
      "      GEN4: npx openapi-typescript",
      `  - script: ${dollar("GEN4")} l.yaml -it`,
    );

    const result = migrated(text, "azure-pipelines.yml", AZURE_PIPELINES_FILE);

    expect(result.text).toBe(renamed(text).replace("l.yaml --immutable", "l.yaml -it"));
    expect(result.manualSteps).toHaveLength(1);
    expect(result.manualSteps[0]).toMatchObject({ location: "azure-pipelines.yml:5" });
  });

  it("migrateYamlCommands reads each step with the env of that step", () => {
    const text = lines(
      "steps:",
      `  - run: ${dollar("GEN")} a.yaml -it`,
      "    env: { GEN: npx openapi-typescript }",
      `  - run: ${dollar("GEN")} b.yaml -it`,
      "    env: { GEN: mytool }",
    );

    const result = migrated(text, "ci.yml", DEFAULT_YAML_FILE);

    expect(result.text).toBe(renamed(text).replace("b.yaml --immutable", "b.yaml -it"));
    expect(result.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands gives the variables of an Azure stage to that stage only", () => {
    const text = lines(
      "stages:",
      "  - stage: A",
      "    variables: [{ name: gen, value: npx openapi-typescript }]",
      `    jobs: [{ job: J, steps: [{ script: ${dollar("(gen)")} a.yaml -it }] }]`,
      "  - stage: B",
      `    jobs: [{ job: K, steps: [{ script: ${dollar("(gen)")} b.yaml -it }] }]`,
    );

    const result = migrated(text, "azure-pipelines.yml", AZURE_PIPELINES_FILE);

    expect(result.text).toBe(renamed(text).replace("b.yaml --immutable", "b.yaml -it"));
    expect(result.manualSteps).toHaveLength(1);
    expect(result.manualSteps[0]).toMatchObject({ location: "azure-pipelines.yml:6" });
  });

  it("migrateYamlCommands gives the variables of a job that a map names to the whole file", () => {
    const text = lines(
      ".base:",
      "  variables: { GEN: npx openapi-typescript }",
      "gen:",
      "  extends: .base",
      `  script: [${dollar("GEN")} api.yaml -it]`,
    );

    expect(migrated(text, ".gitlab-ci.yml", GITLAB_CI_FILE).text).toBe(renamed(text));
  });
});
