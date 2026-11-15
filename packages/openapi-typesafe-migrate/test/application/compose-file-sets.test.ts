import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { outsideServicesOf, planYamlReach } from "../../src/application/yaml-file-reach.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };

const GEN = lines(
  "services:",
  "  gen:",
  "    image: node:22",
  '    entrypoint: ["npx", "openapi-typescript"]',
  '    command: ["api.yaml", "-it"]',
);
const OVERRIDE = lines("services:", "  gen:", '    entrypoint: ["grep"]');

async function outsideOf(files: Readonly<Record<string, string>>, path: string) {
  const reach = await planYamlReach(Object.keys(files), {
    files: new InMemoryProjectFiles(files),
    readers,
  });
  return [...outsideServicesOf(reach, path)];
}

describe("planYamlReach and Compose files that merge", () => {
  it.each([
    ["compose.yaml", "compose.override.yaml"],
    ["docker/docker-compose.yml", "docker/docker-compose.prod.yml"],
  ])("planYamlReach marks a service that %s and %s both give a container", async (a, b) => {
    const files = { [a]: GEN, [b]: OVERRIDE };

    expect([await outsideOf(files, a), await outsideOf(files, b)]).toEqual([["gen"], ["gen"]]);
  });

  it.each([
    ["in another folder", { "compose.yaml": GEN, "other/compose.override.yaml": OVERRIDE }],
    [
      "that sets other keys",
      {
        "compose.yaml": GEN,
        "compose.override.yaml": lines("services:", "  gen:", "    environment: { A: 1 }"),
      },
    ],
    [
      "for another service",
      {
        "compose.yaml": GEN,
        "compose.override.yaml": lines("services:", "  other:", '    entrypoint: ["grep"]'),
      },
    ],
    [
      "whose folder merges others",
      {
        "compose.yaml": GEN,
        "compose.override.yaml": lines("services:", "  other:", "    image: node"),
        "other/compose.yaml": OVERRIDE,
        "other/compose.override.yaml": lines("services:", "  other:", "    image: node"),
      },
    ],
  ])("planYamlReach marks no service of a Compose file %s", async (_, files) => {
    expect(await outsideOf(files, "compose.yaml")).toEqual([]);
  });
});

describe("migrateProject and Compose override files", () => {
  it("migrateProject reports a container that an override file changes, and keeps it", async () => {
    const dependencies = {
      files: new InMemoryProjectFiles({ "compose.yaml": GEN, "compose.override.yaml": OVERRIDE }),
      rewriter: new StubCallbackRewriter(),
      scanner: new QuotedStringScanner(),
      readers,
      logger: new RecordingLogger(),
    };

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(dependencies.files.files.get("compose.yaml")).toBe(GEN);
    expect(files.map((file) => [file.path, file.manualSteps.map((step) => step.kind)])).toEqual([
      ["compose.yaml", ["container-not-known"]],
    ]);
  });
});
