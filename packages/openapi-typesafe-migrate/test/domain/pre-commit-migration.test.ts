import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { migratePreCommitHooks } from "../../src/domain/pre-commit-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const FILE = ".pre-commit-config.yaml";

describe("migratePreCommitHooks", () => {
  it("migratePreCommitHooks reads the entry and the args of a hook as one command", () => {
    const text = lines(
      "repos:",
      "  - repo: local",
      "    hooks:",
      "      - id: gen",
      "        entry: npx openapi-typescript",
      "        args: [api.yaml, '-it']",
      "      - id: other",
      "        entry: prettier",
      "        args: [-it]",
      "        name: openapi-typescript -it",
    );

    const migrated = migratePreCommitHooks(text, FILE, stringsOf(text));

    expect(migrated.text).toBe(
      text
        .replace("npx openapi-typescript", "npx openapi-typesafe")
        .replace("'-it'", "'--immutable'"),
    );
    expect(migrated.changes).toEqual([
      { kind: "command-renamed", location: `${FILE}:5` },
      { kind: "flag-renamed", location: `${FILE}:6`, from: "-it", to: "--immutable" },
    ]);
  });

  it("migratePreCommitHooks renames the packages a hook installs and reports pinned ones", () => {
    const text = lines(
      "- id: gen",
      "  language: node",
      "  entry: openapi-typescript api.yaml",
      "  additional_dependencies:",
      "    - openapi-typescript",
      "    - openapi-fetch@0.13.0",
      "    - left-pad",
    );

    const migrated = migratePreCommitHooks(text, FILE, stringsOf(text));

    expect(migrated.text).toBe(
      text
        .replace("entry: openapi-typescript", "entry: openapi-typesafe")
        .replace("- openapi-typescript\n", "- openapi-typesafe\n"),
    );
    expect(migrated.changes.at(-1)).toEqual({
      kind: "package-name-renamed",
      location: `${FILE}:5`,
      from: "openapi-typescript",
      to: "openapi-typesafe",
    });
    expect(migrated.manualSteps).toEqual([
      { kind: "pinned-package", location: `${FILE}:6`, name: "openapi-fetch" },
    ]);
  });

  it("migratePreCommitHooks splits an entry into words without a shell", () => {
    const text = "- entry: openapi-typescript a.yaml ; -it\n";

    const migrated = migratePreCommitHooks(text, FILE, stringsOf(text));

    expect(migrated.text).toBe("- entry: openapi-typesafe a.yaml ; --immutable\n");
  });
});
