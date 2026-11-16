import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject, type ProjectMigration } from "../../src/application/migrate-project.js";
import { composeReadingOf, planYamlReach } from "../../src/application/yaml-file-reach.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };

const ENTRYPOINT = '    entrypoint: ["npx", "openapi-typescript"]';
const FLAGS = '    command: ["api.yaml", "-it"]';

async function migrated(project: Readonly<Record<string, string>>) {
  const files = new InMemoryProjectFiles(project);
  const dependencies = {
    files,
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers,
    logger: new RecordingLogger(),
  };
  const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });
  return { files: files.files, result };
}

/** Each reported file with the kinds of its steps and their locations. */
const stepsOf = (result: ProjectMigration): string[][] =>
  result.files.map((file) => [
    file.path,
    ...file.manualSteps.map((step) => `${step.kind} ${"location" in step ? step.location : ""}`),
  ]);

const UNKNOWN = "container-not-known";

describe("migrateProject and Compose files linked to a file that names the generator", () => {
  it("migrateProject reports a service whose extends names a file with the generator", async () => {
    const { result } = await migrated({
      "compose.yaml": lines(
        "services:",
        "  types:",
        "    extends:",
        "      file: common.yml",
        "      service: gen",
        FLAGS,
      ),
      "common.yml": lines("services:", "  gen:", "    image: node:22", ENTRYPOINT),
    });

    expect(stepsOf(result)).toEqual([
      ["common.yml", `${UNKNOWN} common.yml:4`],
      ["compose.yaml", `${UNKNOWN} compose.yaml:6`],
    ]);
  });

  it("migrateProject reports the flags of a base service that another file extends", async () => {
    const { result } = await migrated({
      "compose.yaml": lines(
        "services:",
        "  types: { extends: { file: common.yml, service: base }, entrypoint: [npx, openapi-typescript] }",
      ),
      "common.yml": lines("services:", "  base:", "    image: node:22", FLAGS),
    });

    expect(stepsOf(result)).toEqual([
      ["common.yml", `${UNKNOWN} common.yml:4`],
      ["compose.yaml", `${UNKNOWN} compose.yaml:2`],
    ]);
  });

  it("migrateProject edits a base service whose extending service sets no container key", async () => {
    const { files } = await migrated({
      "compose.yaml": lines(
        "services:",
        "  types:",
        "    extends: { file: common.yml, service: gen }",
        "    environment: { A: openapi-typescript }",
      ),
      "common.yml": lines("services:", "  gen:", "    image: node:22", ENTRYPOINT, FLAGS),
    });

    expect(files.get("common.yml")).toBe(
      lines(
        "services:",
        "  gen:",
        "    image: node:22",
        '    entrypoint: ["npx", "openapi-typesafe"]',
        '    command: ["api.yaml", "--immutable"]',
      ),
    );
  });

  it.each([
    ["docker-compose.yml", "docker-compose.override.yml"],
    ["compose.yaml", "compose.override.yaml"],
  ])("migrateProject reports the flags of %s's override file %s", async (base, override) => {
    const { result } = await migrated({
      [base]: lines("services:", "  types:", "    image: node:22", ENTRYPOINT, FLAGS),
      [override]: lines("services:", "  types:", '    command: ["api.yaml", "-it", "-o", "a.ts"]'),
    });

    expect(stepsOf(result)).toEqual(
      [
        [base, `${UNKNOWN} ${base}:5`],
        [override, `${UNKNOWN} ${override}:3`],
      ].sort(),
    );
  });

  it("migrateProject reports a base file's flags when the override gives the generator", async () => {
    const { result } = await migrated({
      "compose.yaml": lines("services:", "  types:", "    image: node:22", FLAGS),
      "compose.override.yaml": lines("services:", "  types:", ENTRYPOINT),
    });

    expect(stepsOf(result)).toEqual([
      ["compose.override.yaml", `${UNKNOWN} compose.override.yaml:3`],
      ["compose.yaml", `${UNKNOWN} compose.yaml:4`],
    ]);
  });

  it("migrateProject leaves a Compose file of another folder than the one that names it", async () => {
    const { result } = await migrated({
      "compose.yaml": lines("services:", "  types:", "    image: node:22", ENTRYPOINT, FLAGS),
      "other/compose.override.yaml": lines("services:", "  types:", FLAGS),
    });

    expect(result.files.map((file) => file.path)).toEqual(["compose.yaml"]);
  });
});

describe("planYamlReach and the files Compose reads together", () => {
  it("planYamlReach links merged, included and extended Compose files", async () => {
    const project = {
      "compose.yaml": lines("include: [inc.yaml]", "services:", "  a:", "    image: node"),
      "compose.override.yaml": lines(
        "services:",
        "  a:",
        "    extends: {file: base.yml, service: b}",
      ),
      "inc.yaml": lines("services:", "  c:", "    image: node"),
      "base.yml": lines("services:", "  b:", "    image: node"),
    };

    const reach = await planYamlReach(Object.keys(project), {
      files: new InMemoryProjectFiles(project),
      readers,
    });

    const links = new Set(reach.compose.links.map((link) => [...link].sort().join(" ")));

    expect([...links].sort()).toEqual([
      "base.yml compose.override.yaml",
      "compose.override.yaml compose.yaml",
      "compose.yaml inc.yaml",
    ]);
    expect([...reach.compose.includedFiles].sort()).toEqual(["base.yml", "inc.yaml"]);
    expect([...(composeReadingOf(reach, "base.yml").outsideServices ?? [])]).toEqual([]);
  });
});
