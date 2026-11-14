import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import {
  AZURE_PIPELINES_FILE,
  CI_ENVIRONMENT_FILE,
  CIRCLECI_FILE,
  COMPOSE_FILE,
  DEFAULT_YAML_FILE,
  GITLAB_CI_FILE,
  type YamlCommandFile,
} from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";
import { AZURE_PARAMETERS } from "../../src/domain/yaml-parameters.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const dollar = (text: string): string => ["$", text].join("");

const migrated = (text: string, file: string, kind: YamlCommandFile) =>
  migrateYamlCommands(text, file, stringsOf(text), kind);

const generatorRenamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe");

const mayRunOther = (location: string, variable: string) => ({
  kind: "variable-not-only-generator",
  location,
  variable,
  flags: ["-it"],
});
const flagsIn = (location: string, variable: string) => ({
  kind: "flags-in-variable",
  location,
  variable,
  flags: ["-it"],
});

describe("migrateYamlCommands and CircleCI parameters", () => {
  it("migrateYamlCommands renames a parameter default and reports the flags of its uses", () => {
    const text = lines(
      "jobs:",
      "  build:",
      "    parameters:",
      "      gen: { type: string, default: npx openapi-typescript }",
      "      flags: { type: string, default: -it }",
      "    steps:",
      "      - run: << parameters.gen >> a.yaml -it",
      "      - run: npx openapi-typescript b.yaml <<parameters.flags>>",
    );

    const result = migrated(text, ".circleci/config.yml", CIRCLECI_FILE);

    expect(result.text).toBe(generatorRenamed(text));
    expect(result.manualSteps).toEqual([
      mayRunOther(".circleci/config.yml:7", "<< parameters.gen >>"),
      flagsIn(".circleci/config.yml:8", "<<parameters.flags>>"),
    ]);
  });

  it("migrateYamlCommands reads a pipeline parameter by its pipeline reference", () => {
    const text = lines(
      "parameters:",
      "  flags: { type: string, default: -it }",
      "jobs:",
      "  build:",
      "    steps: [{ run: npx openapi-typescript a.yaml << pipeline.parameters.flags >> }]",
    );

    const result = migrated(text, ".circleci/config.yml", CIRCLECI_FILE);

    expect(result.manualSteps).toEqual([
      flagsIn(".circleci/config.yml:5", "<< pipeline.parameters.flags >>"),
    ]);
  });
});

describe("migrateYamlCommands and GitLab inputs", () => {
  it("migrateYamlCommands renames an input default and reports the flags of its uses", () => {
    const text = lines(
      "spec:",
      "  inputs:",
      "    gen: { default: npx openapi-typescript }",
      '    flags: { default: "-it" }',
      "---",
      "gen:",
      "  script:",
      "    - $[[ inputs.gen ]] c.yaml -it",
      "    - npx openapi-typescript d.yaml $[[ inputs.flags | expand_vars ]]",
    );

    const result = migrated(text, "templates/gen.yml", GITLAB_CI_FILE);

    expect(result.text).toBe(generatorRenamed(text));
    expect(result.manualSteps).toEqual([
      mayRunOther("templates/gen.yml:8", "$[[ inputs.gen ]]"),
      flagsIn("templates/gen.yml:9", "$[[ inputs.flags | expand_vars ]]"),
    ]);
  });

  it("migrateYamlCommands reads only the defaults of the spec as GitLab inputs", () => {
    const text = lines("job:", "  inputs:", "    gen: { default: npx openapi-typescript }");

    expect(migrated(text, ".gitlab-ci.yml", GITLAB_CI_FILE).text).toBe(text);
  });
});

describe("migrateYamlCommands and Azure template parameters", () => {
  it("migrateYamlCommands renames a parameter default and reports the flags of its uses", () => {
    const text = lines(
      "parameters:",
      "  - { name: gen, type: string, default: npx openapi-typescript }",
      "  - name: flags",
      "    default: -it",
      "steps:",
      `  - script: ${dollar("{{ parameters.gen }}")} b.yaml -it`,
      `  - script: npx openapi-typescript c.yaml ${dollar("{{ parameters['flags'] }}")}`,
      `  - script: npx openapi-typescript d.yaml ${dollar("{{ x.parameters.flags }}")}`,
    );

    const result = migrated(text, "templates/gen.yml", AZURE_PIPELINES_FILE);

    expect(result.text).toBe(generatorRenamed(text));
    expect(result.manualSteps).toEqual([
      mayRunOther("templates/gen.yml:6", dollar("{{ parameters.gen }}")),
      flagsIn("templates/gen.yml:7", dollar("{{ parameters['flags'] }}")),
    ]);
  });
});

describe("AZURE_PARAMETERS", () => {
  it("AZURE_PARAMETERS reads parameters as inputs inside expressions only", () => {
    const text = `./parameters.sh ${dollar("{{ parameters.gen }}")}`;

    expect(AZURE_PARAMETERS.asExpressions(text)).toBe(
      `./parameters.sh ${dollar("{{     inputs.gen }}")}`,
    );
  });

  it("AZURE_PARAMETERS takes a default only from a parameter list item", () => {
    const text = lines(
      "parameters:",
      "  gen: { name: gen, default: npx openapi-typescript }",
      "steps:",
      `  - script: ${dollar("{{ parameters.gen }}")} b.yaml -it`,
    );

    expect(migrated(text, "templates/gen.yml", AZURE_PIPELINES_FILE).text).toBe(text);
  });
});

describe("migrateYamlCommands and GitHub inputs", () => {
  it("migrateYamlCommands reads an input by its name as an index key", () => {
    const text = lines(
      "on: { workflow_call: { inputs: { flags: { default: -it } } } }",
      `jobs: { a: { steps: [{ run: "npx openapi-typescript a.yaml ${dollar("{{ inputs['flags'] }}")}" }] } }`,
    );

    const result = migrated(text, "ci.yml", DEFAULT_YAML_FILE);

    expect(result.manualSteps).toEqual([flagsIn("ci.yml:2", dollar("{{ inputs['flags'] }}"))]);
  });

  it("migrateYamlCommands reads parameter defaults only in the file kind that has them", () => {
    const circle = lines("parameters:", "  gen: { default: npx openapi-typescript }");
    const github = lines("inputs:", "  gen: { default: npx openapi-typescript }");

    expect(migrated(circle, "ci.yml", DEFAULT_YAML_FILE).text).toBe(circle);
    expect(migrated(circle, ".drone.yml", CI_ENVIRONMENT_FILE).text).toBe(circle);
    expect(migrated(github, "compose.yaml", COMPOSE_FILE).text).toBe(github);
    expect(migrated(github, "action.yml", DEFAULT_YAML_FILE).text).toBe(generatorRenamed(github));
  });
});
