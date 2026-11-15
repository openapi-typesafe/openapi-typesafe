import { describe, expect, it } from "vitest";
import { dockerInstructions } from "../../src/domain/dockerfile-instructions.js";
import { migrateDockerfile } from "../../src/domain/dockerfile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const migrate = (text: string) => migrateDockerfile(text, "Dockerfile");
const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");
const BACKTICK = "`";
const ESCAPE_BACKTICK = `# escape=${BACKTICK}`;

describe("dockerInstructions", () => {
  it("dockerInstructions joins a continued line and places each character where it is written", () => {
    const text = lines("# a comment", "RUN npx \\", "", "  # a note", "  openapi-typescript");

    const [instruction] = dockerInstructions(text);

    expect(instruction?.keyword).toBe("RUN");
    expect(instruction?.text.text).toBe("RUN npx   openapi-typescript");
    const at = instruction?.text.text.indexOf("openapi") ?? -1;
    expect(instruction?.text.offsets[at]).toBe(text.indexOf("openapi"));
  });

  it("dockerInstructions continues a line with the escape character of the file only", () => {
    const text = lines(ESCAPE_BACKTICK, "ENV DIR=C:\\app\\", `RUN a ${BACKTICK}`, "  b");

    const read = dockerInstructions(text).map((instruction) => instruction.text.text);

    expect(read).toEqual(["ENV DIR=C:\\app\\", "RUN a   b"]);
  });

  it("dockerInstructions keeps the here-document bodies of a RUN with it", () => {
    const text = lines("RUN <<EOF", "FROM x", "EOF", "CMD a");

    const read = dockerInstructions(text).map((instruction) => instruction.keyword);

    expect(read).toEqual(["RUN", "CMD"]);
  });

  it("dockerInstructions reads no here-document after an instruction that takes none", () => {
    const text = lines("LABEL a=<<EOF", "CMD a", "EOF");

    const read = dockerInstructions(text).map((instruction) => instruction.keyword);

    expect(read).toEqual(["LABEL", "CMD", "EOF"]);
  });
});

describe("migrateDockerfile and continued lines", () => {
  it.each([
    ["RUN", [`RUN npx openapi-typescript a.yaml ${BACKTICK}`, "    -it"]],
    ["CMD", [`CMD ["npx", ${BACKTICK}`, '     "openapi-typescript", "b.yaml", "-it"]']],
    ["ENTRYPOINT", [`ENTRYPOINT ["npx", "openapi-typescript", ${BACKTICK}`, '  "-it"]']],
  ])("migrateDockerfile joins a %s continued with a backtick escape", (_, instruction) => {
    const text = lines(ESCAPE_BACKTICK, "FROM node:22", ...instruction);

    const migrated = migrate(text);

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateDockerfile ends a value at a backslash when the escape character is a backtick", () => {
    const text = lines(
      ESCAPE_BACKTICK,
      "FROM node:22",
      "ENV DIR=C:\\app\\",
      "RUN npx openapi-typescript a.yaml -it",
    );

    expect(migrate(text).text).toBe(renamed(text));
  });

  it("migrateDockerfile leaves out a comment line inside a continued instruction", () => {
    const text = lines("FROM node:22", "RUN npx openapi-typescript a.yaml \\", "# a note", "  -it");

    expect(migrate(text).text).toBe(renamed(text));
  });

  it("migrateDockerfile pairs a continued exec-form CMD with its entrypoint", () => {
    const text = lines(
      "FROM node:22",
      'ENTRYPOINT ["npx", "openapi-typescript"]',
      "RUN echo the other instructions set no entrypoint",
      "CMD \\",
      '  ["a.yaml", "-it"]',
    );

    expect(migrate(text).text).toBe(renamed(text));
  });
});
