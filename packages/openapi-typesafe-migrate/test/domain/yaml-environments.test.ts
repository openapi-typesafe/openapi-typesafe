import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { yamlCommandFileFor } from "../../src/application/yaml-file-kinds.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import {
  CI_ENVIRONMENT_FILE,
  COMPOSE_FILE,
  DEFAULT_YAML_FILE,
  GITLAB_CI_FILE,
  TASKFILE,
  type YamlCommandFile,
} from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const GEN = ["$", "GEN"].join("");
const FLAGS = ["$", "FLAGS"].join("");

const migrated = (text: string, file: string, kind: YamlCommandFile) =>
  migrateYamlCommands(text, file, stringsOf(text), kind);

describe("migrateYamlCommands and the variables of a file kind", () => {
  it("migrateYamlCommands migrates GitLab variables, also with a value map", () => {
    const text = lines(
      "variables:",
      "  GEN: npx openapi-typescript",
      "job:",
      "  variables:",
      "    OAT: { value: openapi-typescript, description: the generator }",
      `  script: [${GEN} a.yaml -it, ${["$", "OAT"].join("")} b.yaml -ap]`,
    );

    expect(migrated(text, ".gitlab-ci.yml", GITLAB_CI_FILE).text).toBe(
      text
        .replaceAll("openapi-typescript", "openapi-typesafe")
        .replace("-it", "--immutable")
        .replace("-ap", "--additional-properties"),
    );
  });

  it("migrateYamlCommands leaves the variables of another file kind as data", () => {
    const text = lines(
      "variables:",
      "  GEN: npx openapi-typescript",
      "environment: { X: openapi-typescript }",
    );

    expect(migrated(text, "values.yml", DEFAULT_YAML_FILE).text).toBe(text);
  });

  it("migrateYamlCommands migrates a CircleCI environment and the flags after it", () => {
    const text = lines(
      "jobs:",
      "  gen:",
      "    environment: { GEN: npx openapi-typescript }",
      `    steps: [{ run: ${GEN} api.yaml -it }]`,
    );

    expect(migrated(text, ".circleci/config.yml", CI_ENVIRONMENT_FILE).text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
    );
  });

  it("migrateYamlCommands reads a Compose environment as a map and as a list", () => {
    const text = lines(
      "services:",
      "  api:",
      "    environment: [GEN=npx openapi-typescript, FLAGS=-it]",
      `    command: sh -c "${GEN} a.yaml ${FLAGS}"`,
      "  web:",
      "    environment: { OAT: openapi-typescript }",
    );

    const result = migrated(text, "compose.yaml", COMPOSE_FILE);

    expect(result.text).toBe(text.replaceAll("openapi-typescript", "openapi-typesafe"));
    expect(result.manualSteps).toEqual([
      { kind: "flags-in-variable", location: "compose.yaml:4", variable: FLAGS, flags: ["-it"] },
    ]);
  });

  it("migrateYamlCommands reads the value of a Compose list item after its name", () => {
    const run = ["$", "RUN"].join("");
    const text = lines(
      "services:",
      "  api:",
      `    environment: [OAT=openapi-typescript, "RUN=${["$", "{OAT}"].join("")}"]`,
      `    command: sh -c "${run} a.yaml -it"`,
    );

    expect(migrated(text, "compose.yaml", COMPOSE_FILE).text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
    );
  });

  it("migrateYamlCommands reads Task vars and env, and the template references to them", () => {
    const text = lines(
      "vars: { GEN: npx openapi-typescript }",
      "env: { RUN: openapi-typescript }",
      "tasks:",
      "  gen:",
      "    cmds:",
      "      - '{{.GEN}} a.yaml -it'",
      "      - '{{- .GEN -}} b.yaml -it'",
      `      - "{{.GEN}} \\"c d.yaml\\" -it"`,
      `      - ${["$", "RUN"].join("")} e.yaml -it`,
    );

    expect(migrated(text, "Taskfile.yml", TASKFILE).text).toBe(
      text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable"),
    );
  });
});

describe("yamlCommandFileFor", () => {
  it.each([
    [".gitlab-ci.yml", GITLAB_CI_FILE],
    ["apps/api/.gitlab/ci/gen.yml", GITLAB_CI_FILE],
    [".circleci/config.yml", CI_ENVIRONMENT_FILE],
    [".drone.yml", CI_ENVIRONMENT_FILE],
    [".woodpecker/gen.yaml", CI_ENVIRONMENT_FILE],
    ["docker-compose.yml", COMPOSE_FILE],
    ["deploy/compose.override.yaml", COMPOSE_FILE],
    [".github/workflows/ci.yml", DEFAULT_YAML_FILE],
    ["composer.yml", DEFAULT_YAML_FILE],
  ])("yamlCommandFileFor reads %s as its kind", (path, kind) => {
    expect(yamlCommandFileFor(path)).toBe(kind);
  });
});
