import { describe, expect, it } from "vitest";
import { migrateDockerfile } from "../../src/domain/dockerfile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("migrateDockerfile", () => {
  it("migrateDockerfile migrates exec-form arrays word by word and shell form as shell", () => {
    const text = lines(
      "FROM node",
      'RUN ["npx", "openapi-typescript", "b.yaml", "-it"]',
      "RUN npx openapi-typescript a.yaml -it",
      'ENTRYPOINT [ "openapi-typescript", \\',
      '    "--redoc", "r.yaml" ]',
      'CMD ["echo", "openapi-typescript -it"]',
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(
      lines(
        "FROM node",
        'RUN ["npx", "openapi-typesafe", "b.yaml", "--immutable"]',
        "RUN npx openapi-typesafe a.yaml --immutable",
        'ENTRYPOINT [ "openapi-typesafe", \\',
        '    "--redocly", "r.yaml" ]',
        'CMD ["echo", "openapi-typescript -it"]',
      ),
    );
    const locations = migrated.changes.map((change) =>
      "location" in change ? change.location : "",
    );
    expect(locations).toEqual([2, 2, 3, 3, 4, 5].map((line) => `Dockerfile:${line}`));
  });

  it.each([
    ['RUN ["openapi-typescript" "a.yaml"]', "no comma"],
    ['RUN ["openapi-typescript", "a\\x"]', "a bad escape"],
    ['RUN ["openapi-typescript", 1]', "a number"],
    ['RUN ["openapi-typescript"', "no end"],
  ])("migrateDockerfile reads %s as shell form (%s)", (instruction) => {
    const migrated = migrateDockerfile(`${instruction}\n`, "Dockerfile");

    expect(migrated.text).toBe(`${instruction}\n`);
    expect(migrated.changes).toEqual([]);
  });

  it("migrateDockerfile reads exec form after RUN flags and the command line of a shell", () => {
    const text = lines(
      'RUN --mount=type=cache,target=/root/.npm --network=none ["npx", "openapi-typescript", "-it"]',
      'RUN ["sh", "-c", "openapi-typescript a.yaml -it && echo done"]',
      'RUN ["/bin/bash", "-o", "pipefail", "-ec", "npx openapi-typescript b.yaml --redoc r"]',
      'CMD ["node", "-c", "openapi-typescript -it"]',
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(
      lines(
        'RUN --mount=type=cache,target=/root/.npm --network=none ["npx", "openapi-typesafe", "--immutable"]',
        'RUN ["sh", "-c", "openapi-typesafe a.yaml --immutable && echo done"]',
        'RUN ["/bin/bash", "-o", "pipefail", "-ec", "npx openapi-typesafe b.yaml --redocly r"]',
        'CMD ["node", "-c", "openapi-typescript -it"]',
      ),
    );
  });

  it("migrateDockerfile reports the command line of a shell that has JSON escapes", () => {
    const text = lines('RUN ["sh", "-c", "openapi-typescript \\"a b.yaml\\" -it"]');

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "command-string", line: 1, to: 'openapi-typesafe "a b.yaml" --immutable' },
    ]);
  });

  it("migrateDockerfile accepts an empty array and decodes escapes", () => {
    const text = lines("CMD []", 'RUN ["npx", "openapi-typescript", "\\u0061.yaml", "-it"]');

    expect(migrateDockerfile(text, "Dockerfile").text).toBe(
      lines("CMD []", 'RUN ["npx", "openapi-typesafe", "\\u0061.yaml", "--immutable"]'),
    );
  });
});

describe("migrateDockerfile and variables", () => {
  const braced = (name: string): string => ["$", "{", name, "}"].join("");

  it("migrateDockerfile migrates ARG and ENV values and the flags where they run", () => {
    const text = lines(
      "ARG GEN=openapi-typescript",
      'ENV TOOL="npx openapi-typescript" OTHER=x',
      "ENV LEGACY openapi-typescript",
      "RUN npx $GEN a.yaml -it",
      `RUN ${braced("TOOL")} b.yaml -it && $LEGACY c.yaml --redoc`,
      "RUN $OTHER d.yaml -it",
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(
      lines(
        "ARG GEN=openapi-typesafe",
        'ENV TOOL="npx openapi-typesafe" OTHER=x',
        "ENV LEGACY openapi-typesafe",
        "RUN npx $GEN a.yaml --immutable",
        `RUN ${braced("TOOL")} b.yaml --immutable && $LEGACY c.yaml --redocly`,
        "RUN $OTHER d.yaml -it",
      ),
    );
  });

  it("migrateDockerfile leaves a variable that is not set to the generator alone", () => {
    const text = lines(
      "ARG NODE=24",
      "ENV",
      "LABEL GEN=openapi-typescript",
      "RUN $NODE a.yaml -it",
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateDockerfile reads a word without a name before = as no variable", () => {
    const text = lines("ARG =openapi-typescript", "RUN npx other a.yaml -it");

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateDockerfile reports the flags after a variable that another stage sets to another tool", () => {
    const text = lines(
      "FROM node AS gen",
      "ENV GEN=openapi-typescript",
      "RUN $GEN a.yaml -it",
      "FROM node",
      "ENV GEN=mytool",
      "RUN $GEN build -it",
    );

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(text.replace("GEN=openapi-typescript", "GEN=openapi-typesafe"));
    expect(migrated.manualSteps).toEqual(
      [3, 6].map((line) => ({
        kind: "variable-not-only-generator",
        location: `Dockerfile:${line}`,
        variable: "$GEN",
        flags: ["-it"],
      })),
    );
  });

  it("migrateDockerfile follows an ENV set to the ARG of the same name", () => {
    const text = lines("ARG GEN=openapi-typescript", "ENV GEN=$GEN", "RUN $GEN a.yaml -it");

    const migrated = migrateDockerfile(text, "Dockerfile");

    expect(migrated.text).toBe(
      lines("ARG GEN=openapi-typesafe", "ENV GEN=$GEN", "RUN $GEN a.yaml --immutable"),
    );
    expect(migrated.manualSteps).toEqual([]);
  });
});
