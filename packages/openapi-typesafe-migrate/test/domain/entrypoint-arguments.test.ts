import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, usedDocumentStrings } from "../../src/domain/config-documents.js";
import { migrateDockerfile } from "../../src/domain/dockerfile-migration.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const migrateYaml = (text: string) => migrateYamlCommands(text, "compose.yaml", stringsOf(text));

/** A step that says the old flags after a program that may be another one were kept. */
const keptStep = (location: string, variable: string, flags: string[]) => ({
  kind: "variable-not-only-generator",
  location,
  variable,
  flags,
});

describe("migrateDockerfile and the command of an entrypoint", () => {
  it("migrateDockerfile renames the flags of a CMD that the generator entrypoint gets", () => {
    const text = lines(
      "FROM node:22",
      `ENTRYPOINT ["openapi-typescript"]`,
      `CMD ["a.yaml", "-it"]`,
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(
      lines("FROM node:22", `ENTRYPOINT ["openapi-typesafe"]`, `CMD ["a.yaml", "--immutable"]`),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateDockerfile keeps the flags of a CMD after another or a pinned entrypoint", () => {
    const text = lines(
      "FROM node:22",
      `ENTRYPOINT ["npx", "openapi-typescript@7"]`,
      `CMD ["a.yaml", "-it"]`,
      "FROM node:22",
      `ENTRYPOINT ["node", "gen.js"]`,
      `CMD ["-it"]`,
      "FROM node:22",
      `ENTRYPOINT ["npx", "-p", "openapi-typescript", "other"]`,
      `CMD ["-it"]`,
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toContain(`CMD ["a.yaml", "-it"]`);
    expect(migrated.text).not.toContain("--immutable");
    expect(migrated.manualSteps).toEqual([{ kind: "versioned-command", location: "Dockerfile:2" }]);
  });

  it("migrateDockerfile keeps a CMD that a shell-form entrypoint ignores", () => {
    const text = lines(
      "FROM node:22",
      `CMD ["a.yaml", "-it"]`,
      "ENTRYPOINT npx openapi-typescript",
      "FROM node:22",
      `ENTRYPOINT ["openapi-typescript"]`,
    );

    expect(migrateDockerfile(text, "Dockerfile").text).toContain(`CMD ["a.yaml", "-it"]`);
  });

  it("migrateDockerfile reports the flags of a CMD that a generator script may pass on", () => {
    const script = String.raw`"npx openapi-typescript \"$@\""`;
    const text = lines(`ENTRYPOINT ["sh", "-c", ${script}, "--"]`, `CMD ["-it"]`);

    const migrated = migrateDockerfile(lines("FROM node:22", text), "Dockerfile");

    expect(migrated.manualSteps).toContainEqual(keptStep("Dockerfile:3", "ENTRYPOINT", ["-it"]));
  });

  it("migrateDockerfile pairs only the last entrypoint of a stage, and no shell form", () => {
    const text = lines(
      "FROM node:22",
      `ENTRYPOINT ["openapi-typescript"]`,
      "ENTRYPOINT node gen.js",
      `CMD ["-it"]`,
    );

    expect(migrateDockerfile(text, "Dockerfile").text).toContain(`CMD ["-it"]`);
  });

  it("migrateDockerfile pairs a CMD with the entrypoint of the stage it starts from", () => {
    const text = lines(
      "FROM node:22 AS Gen",
      `ENTRYPOINT ["openapi-typescript"]`,
      "FROM gen",
      `CMD ["a.yaml", "-it"]`,
      "FROM 0",
      `CMD ["b.yaml", "-it"]`,
      "FROM node:22",
      `CMD ["c.yaml", "-it"]`,
      "FROM gen",
      `ENTRYPOINT ["node"]`,
      `CMD ["d.yaml", "-it"]`,
    );

    const migrated = migrateDockerfile(text, "Dockerfile").text;

    expect(migrated).toContain(`CMD ["a.yaml", "--immutable"]`);
    expect(migrated).toContain(`CMD ["b.yaml", "--immutable"]`);
    expect(migrated).toContain(`CMD ["c.yaml", "-it"]`);
    expect(migrated).toContain(`CMD ["d.yaml", "-it"]`);
  });

  it("migrateDockerfile reads a CMD that runs the generator itself once", () => {
    const text = lines(`ENTRYPOINT ["openapi-typescript"]`, `CMD ["openapi-typescript", "-it"]`);

    const migrated = migrateDockerfile(lines("FROM node:22", text), "Dockerfile");

    expect(migrated.text).toContain(`CMD ["openapi-typesafe", "--immutable"]`);
  });
});

describe("migrateYamlCommands and the command of an entrypoint", () => {
  it("migrateYamlCommands renames the flags of a Compose command after the generator", () => {
    const text = lines(
      "services:",
      "  gen:",
      "    entrypoint: npx openapi-typescript",
      "    image: node:22",
      "    command: b.yaml -it",
      "  list:",
      `    entrypoint: ["npx", "openapi-typescript"]`,
      `    command: ["c.yaml", "-it"]`,
    );

    const migrated = migrateYaml(text);

    expect(migrated.text).toContain("command: b.yaml --immutable");
    expect(migrated.text).toContain(`command: ["c.yaml", "--immutable"]`);
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands renames the args of a Kubernetes command in every document", () => {
    const container = (file: string) => [
      "containers:",
      "  - command: [openapi-typescript]",
      `    args: [${file}, -it]`,
    ];
    const text = lines(...container("a.yaml"), "---", ...container("b.yaml"));

    const migrated = migrateYaml(text);

    expect(migrated.text).toBe(
      lines(
        "containers:",
        "  - command: [openapi-typesafe]",
        "    args: [a.yaml, --immutable]",
        "---",
        "containers:",
        "  - command: [openapi-typesafe]",
        "    args: [b.yaml, --immutable]",
      ),
    );
  });

  it("migrateYamlCommands pairs args written before their command, and an alias once", () => {
    const text = lines(
      "x-args: &args [a.yaml, -it]",
      "containers:",
      "  - args: *args",
      "    command: [openapi-typescript]",
      "  - command: [openapi-typescript]",
      "    args: *args",
    );

    const migrated = migrateYaml(text);

    expect(migrated.text).toContain("x-args: &args [a.yaml, --immutable]");
  });

  it("migrateYamlCommands reports flags in a command folded over lines", () => {
    const text = lines(
      "services:",
      "  a:",
      "    entrypoint: openapi-typescript",
      "    command: >-",
      "      b.yaml",
      "      -it",
    );

    const migrated = migrateYaml(text);

    expect(migrated.text).toContain("      -it");
    expect(migrated.manualSteps).toEqual([keptStep("compose.yaml:4", "entrypoint", ["-it"])]);
  });

  it("migrateYamlCommands reads the lists of one path in two documents as two values", () => {
    const text = lines(
      "command: [openapi-typescript]",
      "args: [a.yaml]",
      "---",
      "args: [-it]",
      "command: [node]",
    );

    expect(migrateYaml(text).text).toContain("args: [-it]");
  });

  it("migrateYamlCommands keeps the command of another entrypoint", () => {
    const text = lines("services:", "  a:", "    entrypoint: node gen.js", "    command: x -it");

    expect(migrateYaml(text)).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateYamlCommands reports flags in a command with an escape", () => {
    const text = lines(
      "services:",
      "  a:",
      "    entrypoint: openapi-typescript",
      String.raw`    command: "b.yaml\t-it"`,
    );

    const migrated = migrateYaml(text);

    expect(migrated.text).toContain(String.raw`command: "b.yaml\t-it"`);
    expect(migrated.manualSteps).toEqual([keptStep("compose.yaml:4", "entrypoint", ["-it"])]);
  });
});
