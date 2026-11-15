import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { planYamlReach } from "../../src/application/yaml-file-reach.js";
import {
  AZURE_PIPELINES_FILE,
  GITLAB_CI_FILE,
  TASKFILE,
} from "../../src/domain/yaml-environments.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const dollar = (text: string): string => ["$", text].join("");
const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };

const reachOf = (files: Readonly<Record<string, string>>) =>
  planYamlReach(Object.keys(files), { files: new InMemoryProjectFiles(files), readers });

function setUp(files: Readonly<Record<string, string>>) {
  return {
    files: new InMemoryProjectFiles(files),
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers,
    logger: new RecordingLogger(),
  };
}

describe("planYamlReach and included files", () => {
  it("planYamlReach gives an included file the kind of the file that includes it", async () => {
    const reach = await reachOf({
      "Taskfile.yml": lines("includes: { gen: ./tasks/gen.yml }"),
      "tasks/gen.yml": lines("includes: { more: ./more.yml }"),
      "tasks/more.yml": lines("tasks: {}"),
      "azure-pipelines.yml": lines("stages: [{ template: templates/gen.yml }]"),
      "templates/gen.yml": lines("steps: []"),
      ".gitlab-ci.yml": lines("include: [{ local: ci/*.yml }]"),
      "ci/a.yml": lines("a: { script: [x] }"),
      "ci/b.yml": lines("b: { script: [x] }"),
    });

    expect(Object.fromEntries(reach.kinds)).toEqual({
      "tasks/gen.yml": TASKFILE,
      "tasks/more.yml": TASKFILE,
      "templates/gen.yml": AZURE_PIPELINES_FILE,
      "ci/a.yml": GITLAB_CI_FILE,
      "ci/b.yml": GITLAB_CI_FILE,
    });
  });

  it("planYamlReach keeps the kind that a file's name gives it, and skips missing files", async () => {
    const reach = await reachOf({
      "azure-pipelines.yml": lines(
        "stages:",
        "  - template: .gitlab/gen.yml",
        "  - template: sub/Taskfile.yml",
        "  - template: missing.yml",
      ),
      ".gitlab/gen.yml": lines("gen: { script: [x] }"),
      "sub/Taskfile.yml": lines("tasks: {}"),
    });

    expect(reach.kinds.size).toBe(0);
  });

  it("planYamlReach reads a GitLab wildcard as a pattern of path parts", async () => {
    const reach = await reachOf({
      ".gitlab-ci.yml": lines("include: [ci/*.yml, deep/**.yml, a.b.yml]"),
      "ci/a.yml": "",
      "ci/sub/b.yml": "",
      "deep/x/y.yml": "",
      "aXb.yml": "",
      "x/ci/a.yml": "",
    });

    expect([...reach.kinds.keys()].sort()).toEqual(["ci/a.yml", "deep/x/y.yml"]);
  });
});

describe("planYamlReach and generator variables", () => {
  it("planYamlReach gives the variables that YAML files set to the old generator", async () => {
    const reach = await reachOf({
      ".gitlab-ci.yml": lines("variables: { GEN: npx openapi-typescript, OTHER: mytool }"),
      "compose.yaml": lines(
        "services: { a: { environment: [OAT=openapi-typescript -it, OTHER=mytool openapi-typescript] } }",
      ),
      ".github/workflows/ci.yml": lines("env: { RUN: echo openapi-typescript }"),
      "values.yml": lines("variables: { NOT_READ: openapi-typescript }"),
    });

    expect([...reach.generatorVariables].sort()).toEqual(["GEN", "OAT"]);
  });

  it("planYamlReach reads the variables of an included file by the kind it is reached as", async () => {
    const reach = await reachOf({
      ".gitlab-ci.yml": lines("include: ci/vars.yml"),
      "ci/vars.yml": lines("variables: { GEN: npx openapi-typescript }"),
    });

    expect([...reach.generatorVariables]).toEqual(["GEN"]);
  });

  it("planYamlReach parses only the files that include files or name an old package", async () => {
    const parsed: string[] = [];
    const yaml = createYamlTextReader();
    const recording = {
      ...readers,
      yaml: {
        read: (text: string) => {
          parsed.push(text);
          return yaml.read(text);
        },
      },
    };
    const files = {
      ".gitlab-ci.yml": lines("variables: { GEN: npx openapi-typescript }"),
      "compose.yaml": lines("services: { a: { image: node } }"),
      "data.yml": lines("value: 1"),
    };

    await planYamlReach(Object.keys(files), {
      files: new InMemoryProjectFiles(files),
      readers: recording,
    });

    expect(parsed).toEqual([files[".gitlab-ci.yml"], files[".gitlab-ci.yml"]]);
  });

  it("planYamlReach gives an included file the variables that its includes set", async () => {
    const reach = await reachOf({
      "Taskfile.yml": lines(
        "vars: { GEN: npx openapi-typescript, G2: npx openapi-typescript }",
        "includes:",
        "  a:",
        "    taskfile: ./tasks/a.yml",
        "    vars: { GEN: grep, G2: { sh: echo hi }, G3: npx openapi-typescript }",
        "  b: { taskfile: ./tasks/b.yml, vars: { GEN: grep } }",
        "  c: { taskfile: ./tasks/b.yml }",
      ),
      "tasks/a.yml": lines("tasks: {}"),
      "tasks/b.yml": lines("tasks: {}"),
    });

    const sorted = (path: string): string[] =>
      [...(reach.includedVariables.get(path) ?? [])].sort();
    expect(sorted("tasks/a.yml")).toEqual(["G2", "G3"]);
    expect(sorted("tasks/b.yml")).toEqual(["G2", "G3", "GEN"]);
  });

  it("planYamlReach leaves an API description unread", async () => {
    const reach = await reachOf({
      "openapi.yaml": lines("openapi: 3.1.0", "env: { GEN: openapi-typescript }"),
    });

    expect(reach.generatorVariables.size).toBe(0);
  });
});

describe("migrateProject and the YAML files that reach others", () => {
  it("migrateProject reports the flags after a CI variable in a script the CI file runs", async () => {
    const dependencies = setUp({
      ".gitlab-ci.yml": lines("variables: { GEN: npx openapi-typescript }", "t: { script: [x] }"),
      "scripts/gen.sh": lines(`${dollar("GEN")} api.yaml -it`),
      "scripts/other.sh": lines(`${dollar("OTHER")} api.yaml -it`),
    });

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(files.map((file) => [file.path, file.manualSteps.map((step) => step.kind)])).toEqual([
      [".gitlab-ci.yml", []],
      ["scripts/gen.sh", ["variable-not-only-generator"]],
    ]);
  });

  it("migrateProject migrates an included file as a file of the kind that includes it", async () => {
    const dependencies = setUp({
      "Taskfile.yml": lines("includes: { gen: ./tasks/gen.yml }"),
      "tasks/gen.yml": lines("tasks: { a: { cmds: [npx openapi-typescript a.yaml -it] } }"),
    });

    await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(dependencies.files.files.get("tasks/gen.yml")).toBe(
      lines("tasks: { a: { cmds: [npx openapi-typesafe a.yaml --immutable] } }"),
    );
  });

  it("migrateProject leaves a variable that a Taskfile include sets to another program", async () => {
    const included = lines("tasks: { a: { cmds: ['{{.GEN}} -it c.txt'] } }");
    const dependencies = setUp({
      "Taskfile.yml": lines(
        "version: '3'",
        "includes: { other: { taskfile: ./tasks/other.yml, vars: { GEN: grep } } }",
        "vars: { GEN: npx openapi-typescript }",
        "tasks: { t: { cmds: ['{{.GEN}} root.yaml -it'] } }",
      ),
      "tasks/other.yml": included,
    });

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(files.map((file) => file.path)).toEqual(["Taskfile.yml"]);
    expect(dependencies.files.files.get("tasks/other.yml")).toBe(included);
  });

  it("migrateProject reads an included file as a CI file even when it looks like an API", async () => {
    const dependencies = setUp({
      ".gitlab-ci.yml": lines("include: ci/openapi.yml"),
      "ci/openapi.yml": lines(
        "openapi: 3.1.0",
        "info: { title: gen, version: 1.0.0 }",
        "paths: {}",
        "gen: { script: [npx openapi-typescript a.yaml] }",
      ),
    });

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(files.map((file) => file.path)).toEqual(["ci/openapi.yml"]);
  });

  it.each([
    [
      "Taskfile.yml",
      lines(
        "version: '3'",
        "includes: { gen: ./tasks/gen.yml }",
        "vars: { GEN: npx openapi-typescript }",
      ),
      "tasks/gen.yml",
      lines("tasks: { a: { cmds: ['{{.GEN}} c.yaml -it'] } }"),
    ],
    [
      "Taskfile.yml",
      lines(
        "version: '3'",
        "includes: { gen: ./tasks/Taskfile.yml }",
        "vars: { GEN: npx openapi-typescript }",
      ),
      "tasks/Taskfile.yml",
      lines("tasks: { a: { cmds: ['{{.GEN}} c.yaml -it'] } }"),
    ],
    [
      "azure-pipelines.yml",
      lines("variables: { gen: npx openapi-typescript }", "steps: [{ template: templates/t.yml }]"),
      "templates/t.yml",
      lines("steps: [{ script: '$(gen) a.yaml -it' }]"),
    ],
  ])(
    "migrateProject reports the flags after a %s variable in an included file",
    async (...files) => {
      const [root, rootText, included, includedText] = files;
      const dependencies = setUp({ [root]: rootText, [included]: includedText });

      const { files: migrated } = await migrateProject(dependencies, {
        version: "1.0.0",
        isWrite: false,
      });

      const steps = migrated.find((file) => file.path === included)?.manualSteps ?? [];
      expect(steps.map((step) => step.kind)).toEqual(["variable-not-only-generator"]);
    },
  );
});
