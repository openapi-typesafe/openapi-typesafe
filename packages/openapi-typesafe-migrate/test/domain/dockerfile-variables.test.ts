import { describe, expect, it } from "vitest";
import { migrateDockerfile } from "../../src/domain/dockerfile-migration.js";
import { escapeCharacter } from "../../src/domain/dockerfile-variables.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const migrate = (text: string) => migrateDockerfile(text, "Dockerfile");
const renamed = (text: string): string =>
  text
    .replaceAll("openapi-typescript", "openapi-typesafe")
    .replaceAll("-it", "--immutable")
    .replaceAll("--redoc", "--redocly");
const BACKTICK = "`";
const dollar = (text: string): string => ["$", text].join("");

describe("migrateDockerfile and ENV and ARG values", () => {
  it.each([
    ["ENV GEN=node_modules/.bin/openapi-typescript\\ --redoc\\ r.yaml", "RUN $GEN api.yaml"],
    ['ARG G2="npx "openapi-typescript', "RUN $G2 api.yaml -it"],
    ["ENV GEN='npx openapi-typescript -it'", "RUN $GEN api.yaml"],
    ['ENV GEN "npx openapi-typescript"', "RUN $GEN api.yaml -it"],
    ["ENV A=1 GEN=npx\\ openapi-typescript", "RUN $GEN api.yaml -it"],
    ['ENV GEN="npx \\', '  openapi-typescript"', "RUN $GEN api.yaml -it"],
    ['ENV GEN="npx \\"openapi-typescript\\""', "RUN $GEN api.yaml -it"],
    ['ENV GEN="\\"npx\\" openapi-typescript"', "RUN $GEN api.yaml -it"],
    [`ENV GEN=${dollar("{GEN:-npx\\ openapi-typescript}")}`, "RUN $GEN api.yaml"],
  ])("migrateDockerfile renames the generator command that %s sets", (...instructions) => {
    const text = lines("FROM node:22", ...instructions);

    const migrated = migrate(text);

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateDockerfile keeps a parameter default whole in a value", () => {
    const text = lines(
      "FROM node:22",
      `ENV GEN="${dollar("{GEN:-npx openapi-typescript}")}"`,
      "RUN $GEN api.yaml -it",
    );

    expect(migrate(text).text).toContain(`ENV GEN="${dollar("{GEN:-npx openapi-typesafe}")}"`);
  });

  it("migrateDockerfile reads the values of a Dockerfile whose escape character is a backtick", () => {
    const text = lines(
      `# escape=${BACKTICK}`,
      "FROM node:22",
      `ENV GEN=npx${BACKTICK} openapi-typescript`,
      "RUN $GEN api.yaml -it",
    );

    expect(migrate(text).text).toBe(renamed(text));
  });

  it("migrateDockerfile reports an old name that a continued line splits in a value", () => {
    const text = lines(
      "FROM node:22",
      "ENV GEN=npx\\ openapi-type\\",
      "script",
      "RUN $GEN api.yaml",
    );

    expect(migrate(text).manualSteps).toEqual([
      { kind: "old-name-in-command", location: "Dockerfile:2", word: "openapi-typescript" },
    ]);
  });

  it("migrateDockerfile reports an old name that an escape splits in a value", () => {
    const text = lines("FROM node:22", "ENV GEN=npx\\ openapi-type\\script", "RUN $GEN api.yaml");

    const migrated = migrate(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "Dockerfile:2", word: "openapi-typescript" },
    ]);
  });
});

describe("escapeCharacter", () => {
  it.each([
    [lines("FROM node"), "\\"],
    [lines(`# escape=${BACKTICK}`, "FROM node"), BACKTICK],
    [lines(`# ESCAPE=${BACKTICK}`, "FROM node"), BACKTICK],
    [lines("# syntax=docker/dockerfile:1", `#escape = ${BACKTICK}`, "FROM node"), BACKTICK],
    [lines("FROM node", `# escape=${BACKTICK}`), "\\"],
    [lines("# a comment", `# escape=${BACKTICK}`, "FROM node"), "\\"],
  ])("escapeCharacter of %j is %s", (text, escapeMark) => {
    expect(escapeCharacter(text)).toBe(escapeMark);
  });
});
