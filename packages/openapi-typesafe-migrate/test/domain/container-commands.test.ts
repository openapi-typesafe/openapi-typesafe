import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateCommand } from "../../src/domain/command-migration.js";
import { type DocumentString, usedDocumentStrings } from "../../src/domain/config-documents.js";
import { migrateDockerfile } from "../../src/domain/dockerfile-migration.js";
import { containerCommand } from "../../src/domain/entrypoint-arguments.js";
import { shellScript } from "../../src/domain/shell-scripts.js";
import { shellCommands } from "../../src/domain/shell-words.js";
import { COMPOSE_FILE } from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const migrateCompose = (text: string) =>
  migrateYamlCommands(text, "compose.yaml", stringsOf(text), COMPOSE_FILE);
const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");
const BRACED_ARGUMENTS = ["$", "{@}"].join("");
const wordsOf = (line: string) => shellCommands(line)[0] ?? [];
const valuesOf = (commands: readonly (readonly { readonly value: string }[])[]) =>
  commands.map((words) => words.map((word) => word.value));

describe("containerCommand", () => {
  it.each([
    ["tini --", "tini -- | npx openapi-typescript a.yaml"],
    ["/sbin/tini -s -p SIGTERM --", "/sbin/tini -s -p SIGTERM -- | npx openapi-typescript a.yaml"],
    ["docker-entrypoint.sh", "docker-entrypoint.sh | npx openapi-typescript a.yaml"],
    ["sh -c 'exec \"$@\"' --", 'sh -c exec "$@" -- | npx openapi-typescript a.yaml'],
    [
      `bash -c 'echo up; exec ${BRACED_ARGUMENTS}' x`,
      `bash -c echo up; exec ${BRACED_ARGUMENTS} x | npx openapi-typescript a.yaml`,
    ],
  ])("containerCommand after %s reads the generator command as its own command", (entry, read) => {
    const commands = containerCommand(wordsOf(entry), wordsOf("npx openapi-typescript a.yaml"));

    expect(
      valuesOf(commands)
        .map((words) => words.join(" "))
        .join(" | "),
    ).toBe(read);
  });

  it.each([
    ["npx", "a.yaml -it"],
    ["sh -c 'grep -it x \"$@\"' --", "openapi-typescript a.yaml"],
  ])("containerCommand of %s and %s joins them into one command", (entry, command) => {
    const commands = containerCommand(wordsOf(entry), wordsOf(command));

    expect(valuesOf(commands)).toHaveLength(1);
  });
});

describe("shellScript", () => {
  it.each([
    ["sh -c 'x'", "x"],
    ["/bin/bash -o pipefail -ec 'x'", "x"],
    ["bash -c -- 'x'", "x"],
    ["sh -c -- '-x'", "-x"],
    ["ksh +o posix -c 'x'", "x"],
    ["bash --norc -c 'x'", "x"],
  ])("shellScript of %s is the script after the options", (line, script) => {
    expect(shellScript(wordsOf(line))?.value).toBe(script);
  });

  it.each([["sh x.sh"], ["bash --norc x.sh"], ["sh -e -- x.sh"], ["sh -o c x.sh"]])(
    "shellScript of %s without a -c option is undefined",
    (line) => {
      expect(shellScript(wordsOf(line))).toBeUndefined();
    },
  );
});

describe("migrateYamlCommands and init entrypoints", () => {
  it.each([
    ['["tini", "--"]'],
    ['["/usr/bin/dumb-init", "-r", "15:2", "--"]'],
    ['["docker-entrypoint.sh"]'],
    ['["gosu", "node"]'],
    ['["sh", "-c", "exec \\"$$@\\"", "--"]'],
  ])("migrateYamlCommands after entrypoint %s renames the generator command", (entrypoint) => {
    const text = lines(
      "services:",
      "  gen:",
      `    entrypoint: ${entrypoint}`,
      '    command: ["npx", "openapi-typescript", "a.yaml", "-it"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands renames the args of a Kubernetes init command", () => {
    const text = lines(
      "spec:",
      "  containers:",
      "    - name: gen",
      '      command: ["catatonit", "--"]',
      '      args: ["node_modules/.bin/openapi-typescript", "a.yaml", "-it"]',
    );

    expect(migrateYamlCommands(text, "pod.yaml", stringsOf(text)).text).toBe(renamed(text));
  });

  it("migrateYamlCommands keeps a pinned generator path after an init entrypoint", () => {
    const text = lines(
      "services:",
      "  gen:",
      '    entrypoint: ["tini", "--"]',
      '    command: ["/opt/openapi-typescript", "a.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(text);
  });
});

describe("migrateDockerfile and init entrypoints", () => {
  it("migrateDockerfile renames a CMD that runs the generator after an init entrypoint", () => {
    const text = lines(
      "FROM node:22",
      'ENTRYPOINT ["/sbin/tini", "--"]',
      'CMD ["npx", "openapi-typescript", "a.yaml", "-it"]',
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateDockerfile reports an escaped entrypoint script once for two stages", () => {
    const text = lines(
      "FROM node:22",
      'ENTRYPOINT ["sh", "-c", "openapi-typescript \\"$@\\"", "--"]',
      'CMD ["a.yaml"]',
      "FROM node:22",
      'CMD ["b.yaml"]',
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.manualSteps).toHaveLength(1);
  });
});

describe("migrateCommand and init programs", () => {
  it.each([
    ["dumb-init --rewrite 15:2 npx openapi-typescript a.yaml -it"],
    ["tini -e 143 -- npx openapi-typescript a.yaml -it"],
    ["su-exec app npx openapi-typescript a.yaml -it"],
    ["gosu node npx openapi-typescript a.yaml -it"],
    ["catatonit -- npx openapi-typescript a.yaml -it"],
    ["docker-init -p SIGTERM -- npx openapi-typescript a.yaml -it"],
    ["/usr/bin/env npx openapi-typescript a.yaml -it"],
  ])("migrateCommand renames the generator after %s", (line) => {
    expect(migrateCommand(line, "scripts.gen").text).toBe(renamed(line));
  });
});
