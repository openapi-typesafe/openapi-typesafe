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

  it("migrateDockerfile accepts an empty array and decodes escapes", () => {
    const text = lines("CMD []", 'RUN ["npx", "openapi-typescript", "\\u0061.yaml", "-it"]');

    expect(migrateDockerfile(text, "Dockerfile").text).toBe(
      lines("CMD []", 'RUN ["npx", "openapi-typesafe", "\\u0061.yaml", "--immutable"]'),
    );
  });
});
