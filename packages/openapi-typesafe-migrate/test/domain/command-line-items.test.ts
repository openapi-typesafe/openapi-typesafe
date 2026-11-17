import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentValue, usedDocumentValues } from "../../src/domain/config-documents.js";
import { migrateDockerfile } from "../../src/domain/dockerfile-migration.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function valuesOf(text: string): DocumentValue[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentValues(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const NAME = { from: "openapi-typescript", to: "openapi-typesafe" };
const FLAG = { from: "-it", to: "--immutable" };
const LINE = "npx openapi-typescript api.yaml -it";

const migrate = (text: string) => migrateYamlCommands(text, "job.yaml", valuesOf(text));

const container = (...keys: string[]): string =>
  lines("spec:", "  containers:", "    - name: gen", "      image: node:22", ...keys);

describe("migrateYamlCommands and list items that hold a command line", () => {
  it.each([
    ["one item", `      args: ["${LINE}"]`],
    ["an item before others", `      args: ["${LINE}", "--redoc"]`],
    ["an item after -c", `      args: ["-c", "${LINE}"]`],
  ])("migrateYamlCommands reports the args alone of the image with %s", (_, args) => {
    const text = container(args);

    const migrated = migrate(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "container-not-known",
        location: "job.yaml:5",
        unknown: "image-program",
        renames: [NAME, FLAG],
      },
    ]);
  });

  it("migrateYamlCommands reports a command item that holds a command line, and keeps it", () => {
    const text = container(`      command: ["${LINE}"]`);

    const migrated = migrate(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "command-line-in-item", location: "job.yaml:5", renames: [NAME, FLAG] },
    ]);
  });

  it("migrateYamlCommands edits an item that a shell of the container runs", () => {
    const text = container('      command: ["sh", "-c"]', `      args: ["${LINE}"]`);

    const migrated = migrate(text);

    expect(migrated.text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it.each([
    [
      "the code of an interpreter",
      '      command: ["node", "-e", "const t = require(\'openapi-typescript\')"]',
    ],
    ["one word", '      command: ["openapi-typescript", "api.yaml"]'],
    ["words that run no old package", '      command: ["npx", "other api.yaml -it"]'],
  ])("migrateYamlCommands reads no command line in %s", (_, command) => {
    const steps = migrate(container(command)).manualSteps.map((step) => step.kind);

    expect(steps).not.toContain("command-line-in-item");
  });
});

const dockerfile = (...instructions: string[]): string => lines("FROM node:22", ...instructions);
const migrateDocker = (text: string) => migrateDockerfile(text, "Dockerfile");
const itemStep = (line: number, renames = [NAME, FLAG]) => ({
  kind: "command-line-in-item",
  location: `Dockerfile:${line}`,
  renames,
});

describe("migrateDockerfile and exec-form items that hold a command line", () => {
  it.each([
    ["CMD", `CMD ["${LINE}"]`],
    ["RUN", `RUN ["${LINE}"]`],
    ["RUN with a flag", `RUN --network=none ["${LINE}"]`],
    ["ENTRYPOINT", `ENTRYPOINT ["${LINE}"]`],
    ["an item after others", `CMD ["echo", "${LINE}"]`],
    ["an item with JSON escapes", 'CMD ["npx openapi-typescript \\"api.yaml\\" -it"]'],
  ])("migrateDockerfile reports the item of %s and keeps it", (_, instruction) => {
    const text = dockerfile(instruction);

    const migrated = migrateDocker(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([itemStep(2)]);
  });

  it("migrateDockerfile reports an entrypoint item that two stages run once", () => {
    const text = lines(
      "FROM node:22 AS base",
      'ENTRYPOINT ["npx openapi-typescript"]',
      "FROM base",
      'CMD ["api.yaml"]',
    );

    expect(migrateDocker(text).manualSteps).toEqual([itemStep(2, [NAME])]);
  });

  it("migrateDockerfile edits an item that a shell of the entrypoint runs", () => {
    const text = dockerfile('ENTRYPOINT ["sh", "-c"]', `CMD ["${LINE}"]`);

    const migrated = migrateDocker(text);

    expect(migrated.text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it.each([
    ["the code of an interpreter", `RUN ["node", "-e", "${LINE}"]`],
    ["one word", 'CMD ["openapi-typescript", "api.yaml"]'],
    ["words that run no old package", 'CMD ["npx", "other api.yaml -it"]'],
  ])("migrateDockerfile reads no command line in %s", (_, instruction) => {
    const steps = migrateDocker(dockerfile(instruction)).manualSteps.map((step) => step.kind);

    expect(steps).not.toContain("command-line-in-item");
  });
});
