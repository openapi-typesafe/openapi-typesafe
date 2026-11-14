import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { usesVariable } from "../../src/domain/yaml-generator-variables.js";
import {
  AZURE_TEMPLATES,
  GITLAB_INCLUDES,
  includedPaths,
  NO_INCLUDES,
  TASKFILE_INCLUDES,
} from "../../src/domain/yaml-includes.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("includedPaths", () => {
  it("includedPaths reads Taskfile includes from the folder of the Taskfile", () => {
    const text = lines(
      "includes:",
      "  gen: ./tasks/gen.yml",
      "  docs: { taskfile: ../docs/Taskfile.dist.yaml, dir: ../docs }",
      "  folder: ./tasks",
      "  computed: ./{{.OS}}.yml",
      "  other: { taskfile: ./other.yml, vars: { FILE: ./vars.yml }, aliases: [./alias.yml] }",
      "tasks: { a: { cmds: [x.yml] } }",
    );
    const listed = lines("includes: [./listed.yml]");

    expect(includedPaths("sub/Taskfile.yml", stringsOf(text), TASKFILE_INCLUDES)).toEqual([
      "sub/tasks/gen.yml",
      "docs/Taskfile.dist.yaml",
      "sub/other.yml",
    ]);
    expect(includedPaths("Taskfile.yml", stringsOf(listed), TASKFILE_INCLUDES)).toEqual([]);
  });

  it("includedPaths reads GitLab local includes from the project root in each form", () => {
    const one = lines("include: ci/a.yml", "image: ci/image.yml");
    const many = lines(
      "include:",
      "  - /ci/b.yml",
      "  - local: ci/c.yaml",
      "  - remote: https://example.com/d.yml",
      "  - template: Auto-DevOps.gitlab-ci.yml",
      "  - local: $CI_DIR/e.yml",
      "  - local: ci/*.yml",
      "  - project: group/project",
      "    file: f.yml",
    );
    const map = lines("include: { local: ci/g.yml }");

    const paths = [one, many, map].flatMap((text) =>
      includedPaths("apps/api/.gitlab-ci.yml", stringsOf(text), GITLAB_INCLUDES),
    );

    expect(paths).toEqual(["ci/a.yml", "ci/b.yml", "ci/c.yaml", "ci/*.yml", "ci/g.yml"]);
  });

  it("includedPaths reads Azure templates from the file's folder or from the root", () => {
    const text = lines(
      "stages:",
      "  - template: templates/gen.yml",
      "  - template: /shared/steps.yml",
      "  - template: gen.yml@templates",
      `  - template: ${["$", "{{ parameters.file }}"].join("")}.yml`,
      "extends: { template: ../base.yml }",
      "variables: [{ template: vars.yml }]",
    );

    expect(includedPaths("ci/azure-pipelines.yml", stringsOf(text), AZURE_TEMPLATES)).toEqual([
      "ci/templates/gen.yml",
      "shared/steps.yml",
      "base.yml",
      "ci/vars.yml",
    ]);
  });

  it("includedPaths gives nothing for a file kind that includes no files", () => {
    expect(includedPaths("ci.yml", stringsOf("include: a.yml\n"), NO_INCLUDES)).toEqual([]);
  });
});

describe("usesVariable", () => {
  const names = new Set(["GEN", "MY.GEN"]);

  it.each([
    ["$GEN api.yaml", true],
    [`${["$", "{GEN}"].join("")} api.yaml`, true],
    ["$(GEN) api.yaml", true],
    ["%GEN% api.yaml", true],
    ["& $env:GEN api.yaml", true],
    ["$MY.GEN", true],
    ["$GENERATOR api.yaml", false],
    ["$MYXGEN", false],
    ["GEN api.yaml", false],
  ])("usesVariable reads %s as %s", (text, expected) => {
    expect(usesVariable(text, names)).toBe(expected);
  });

  it("usesVariable is false for no names", () => {
    expect(usesVariable("$GEN $ %%", new Set())).toBe(false);
  });
});
