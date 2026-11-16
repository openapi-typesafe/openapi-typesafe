import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { composeReadingOf, planYamlReach } from "../../src/application/yaml-file-reach.js";
import { COMPOSE_FILE, GITLAB_CI_FILE } from "../../src/domain/yaml-environments.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };

const service = (name: string, ...keys: string[]) => ["services:", `  ${name}:`, ...keys];
const GEN = lines(
  ...service(
    "gen",
    "    image: node:22",
    '    entrypoint: ["npx", "openapi-typescript"]',
    '    command: ["api.yaml", "-it"]',
  ),
);
const GREP = '    entrypoint: ["grep"]';

const reachOf = (files: Readonly<Record<string, string>>) =>
  planYamlReach(Object.keys(files), { files: new InMemoryProjectFiles(files), readers });

async function readingOf(files: Readonly<Record<string, string>>, path: string) {
  const reading = composeReadingOf(await reachOf(files), path);
  return {
    outside: [...(reading.outsideServices ?? [])],
    included: [...(reading.includedServices ?? [])].sort(),
    unread: Object.fromEntries(reading.unreadIncludes ?? []),
  };
}

describe("planYamlReach and Compose includes", () => {
  it("planYamlReach reads an included file as a Compose file whatever its name", async () => {
    const reach = await reachOf({
      "compose.yaml": lines("include: [infra/gen.yaml]"),
      "infra/gen.yaml": GEN,
    });

    expect(reach.kinds.get("infra/gen.yaml")).toBe(COMPOSE_FILE);
  });

  it("planYamlReach gives a file the services of its includes, nested ones relative to them", async () => {
    const files = {
      "compose.yaml": lines(
        "include:",
        "  - path: infra/a.yaml",
        "    project_directory: .",
        "    env_file: a.env",
      ),
      "infra/a.yaml": lines("include: [db/b.yaml]", ...service("a", "    image: node")),
      "infra/db/b.yaml": lines(...service("b", "    image: node")),
    };

    expect((await readingOf(files, "compose.yaml")).included).toEqual(["a", "b"]);
  });

  it("planYamlReach marks a service that the files of one include's path list both set", async () => {
    const files = {
      "compose.yaml": lines("include:", "  - path: [infra/gen.yaml, infra/grep.yaml]"),
      "infra/gen.yaml": GEN,
      "infra/grep.yaml": lines(...service("gen", GREP)),
    };

    expect((await readingOf(files, "infra/gen.yaml")).outside).toEqual(["gen"]);
  });

  it("planYamlReach marks an included service that an override file of the includer sets", async () => {
    const files = {
      "compose.yaml": lines("include: [infra/gen.yaml]"),
      "compose.override.yaml": lines(...service("gen", GREP)),
      "infra/gen.yaml": GEN,
    };

    expect((await readingOf(files, "infra/gen.yaml")).outside).toEqual(["gen"]);
  });

  it("planYamlReach marks a nested included service that an override file of the includer sets", async () => {
    const files = {
      "compose.yaml": lines("include: [infra/a.yaml]"),
      "compose.override.yaml": lines(...service("gen", GREP)),
      "infra/a.yaml": lines("include: [gen.yaml]"),
      "infra/gen.yaml": GEN,
    };

    expect((await readingOf(files, "infra/gen.yaml")).outside).toEqual(["gen"]);
  });

  it("planYamlReach keeps the kind that a file's name or another include gives it", async () => {
    const reach = await reachOf({
      ".gitlab-ci.yml": lines("include: [{ local: shared.yml }]"),
      "compose.yaml": lines("include: [shared.yml, Taskfile.yml]"),
      "shared.yml": lines("job: { script: [a] }"),
      "Taskfile.yml": lines("tasks: {}"),
    });

    expect([reach.kinds.get("shared.yml"), reach.kinds.get("Taskfile.yml")]).toEqual([
      GITLAB_CI_FILE,
      undefined,
    ]);
  });

  it("planYamlReach parses a lone Compose file only when a top-level include may be in it", async () => {
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
      "compose.yaml": lines("x:", "  include: [a.yaml]"),
      "a.yaml": lines(...service("a", "    image: node")),
    };

    await planYamlReach(Object.keys(files), {
      files: new InMemoryProjectFiles(files),
      readers: recording,
    });

    expect(parsed).toEqual([]);
  });

  it.each([
    ["a missing file", "missing.yaml"],
    ["a file outside the project", "../other/compose.yaml"],
    ["a remote file", "oci://registry/gen:1"],
    ["a path with a variable", ["$", "{DIR}/gen.yaml"].join("")],
  ])("planYamlReach records an include of %s as not read", async (_, path) => {
    const files = { "compose.yaml": lines(`include: ["${path}"]`) };

    expect((await readingOf(files, "compose.yaml")).unread).toEqual({ [path]: "not-in-project" });
  });

  it("planYamlReach records each include of a cycle as not read", async () => {
    const files = {
      "compose.yaml": lines("include: [infra/a.yaml]"),
      "infra/a.yaml": lines("include: [../compose.yaml]", ...service("a", "    image: node")),
    };

    const [main, included] = [
      await readingOf(files, "compose.yaml"),
      await readingOf(files, "infra/a.yaml"),
    ];

    expect([main.unread, main.included]).toEqual([{ "infra/a.yaml": "cycle" }, ["a"]]);
    expect(included.unread).toEqual({ "../compose.yaml": "cycle" });
  });
});

describe("migrateProject and Compose includes", () => {
  function setUp(files: Readonly<Record<string, string>>) {
    return {
      files: new InMemoryProjectFiles(files),
      rewriter: new StubCallbackRewriter(),
      scanner: new QuotedStringScanner(),
      readers,
      logger: new RecordingLogger(),
    };
  }

  it("migrateProject reports a service that the main file defines again after an include", async () => {
    const dependencies = setUp({
      "compose.yaml": lines("include: [gen.yaml]", ...GEN.trimEnd().split("\n")),
      "gen.yaml": lines(...service("gen", GREP)),
    });

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(files.map((file) => [file.path, file.manualSteps.map((step) => step.kind)])).toEqual([
      ["compose.yaml", ["compose-service-conflict", "container-not-known"]],
    ]);
  });

  it("migrateProject migrates an included file with the extends of its own services", async () => {
    const included = lines(
      ...service("base", '    entrypoint: ["npx", "openapi-typescript"]'),
      "  gen:",
      "    extends: base",
      '    command: ["api.yaml", "-it"]',
    );
    const dependencies = setUp({
      "compose.yaml": lines("include: [tools.yaml]"),
      "tools.yaml": included,
    });

    await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(dependencies.files.files.get("tools.yaml")).toBe(
      included.replace("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
    );
  });

  it("migrateProject reports an include whose file is missing in a file it migrates", async () => {
    const dependencies = setUp({
      "compose.yaml": lines("include: [missing.yaml]", "x: openapi-typescript"),
    });

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(files.flatMap((file) => file.manualSteps)).toEqual([
      {
        kind: "compose-include-not-read",
        location: "compose.yaml:1",
        path: "missing.yaml",
        problem: "not-in-project",
      },
    ]);
  });
});
