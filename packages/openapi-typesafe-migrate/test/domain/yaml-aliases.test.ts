import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import {
  documentStrings,
  type TreeNode,
  usedDocumentStrings,
} from "../../src/domain/config-documents.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const yaml = createYamlTextReader();
const context = {
  version: "1.0.0",
  catalogs: NO_CATALOG_PLAN,
  manifests: [],
  aliases: [],
  apiDescriptionParts: new Set<string>(),
  rewriter: new StubCallbackRewriter(),
  scanner: new QuotedStringScanner(),
  readers: { json: createJsonTextReader(), yaml },
};
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

function documentsOf(text: string): readonly TreeNode[] {
  const read = yaml.read(text);
  if (read.kind !== "read") {
    throw new Error(`expected ${text} to be read`);
  }
  return read.documents;
}

/** The key path and the text as written of each string where it is used. */
const usedOf = (text: string): string[] =>
  usedDocumentStrings(documentsOf(text)).map(
    (string) => `${string.path.join(".")}=${text.slice(string.content.start, string.content.end)}`,
  );

const migrated = (text: string): ReturnType<typeof migrateYamlCommands> =>
  migrateYamlCommands(text, ".gitlab-ci.yml", usedDocumentStrings(documentsOf(text)));

describe("usedDocumentStrings", () => {
  it("usedDocumentStrings gives the strings of an anchor again at the path of each alias", () => {
    const text = lines(".a: &a [x, y]", "b: { s: [*a, z] }", "c: *a");

    expect(usedOf(text)).toEqual([
      ".a.0=x",
      ".a.1=y",
      "b.s.0.0=x",
      "b.s.0.1=y",
      "b.s.1=z",
      "c.0=x",
      "c.1=y",
    ]);
  });

  it("usedDocumentStrings follows an anchor on an item of a list", () => {
    const text = lines(".a: [&a x]", "b: *a");

    expect(usedOf(text)).toEqual([".a.0=x", "b=x"]);
  });

  it("usedDocumentStrings follows the last anchor of a name before the alias", () => {
    const text = lines(".a: &a x", "b: *a", ".c: &a y", "d: *a");

    expect(usedOf(text)).toEqual([".a=x", "b=x", ".c=y", "d=y"]);
  });

  it("usedDocumentStrings follows an alias inside an anchor and stops at one inside its own", () => {
    const text = lines(".a: &a x", ".b: &b [*a]", "c: *b", "d: &d [*d, y]");

    expect(usedOf(text)).toEqual([".a=x", ".b.0=x", "c.0=x", "d.1=y"]);
  });

  it("documentStrings does not follow aliases", () => {
    const text = lines(".a: &a x", "b: *a");

    expect(documentStrings(documentsOf(text)).map((string) => string.path.join("."))).toEqual([
      ".a",
    ]);
  });
});

describe("migrateYamlCommands and YAML aliases", () => {
  it("migrateYamlCommands migrates a script anchor where its text is", () => {
    const text = lines(
      ".gen_scripts: &gen_scripts",
      "  - npx openapi-typescript api.yaml -it",
      "types:",
      "  script:",
      "    - *gen_scripts",
      "    - git diff --exit-code",
    );

    expect(migrated(text).text).toBe(
      text.replace("openapi-typescript api.yaml -it", "openapi-typesafe api.yaml --immutable"),
    );
  });

  it("migrateYamlCommands migrates a script that two command keys use once", () => {
    const text = lines(
      "a:",
      "  script: &gen [npx openapi-typescript api.yaml -it]",
      "b: { script: *gen }",
      "c: { before_script: *gen }",
    );

    const result = migrated(text);

    expect(result.text).toBe(
      text.replace("typescript api.yaml -it", "typesafe api.yaml --immutable"),
    );
    expect(result.changes).toHaveLength(2);
  });

  it("migrateYamlCommands reads an env map that an alias uses once", () => {
    const text = lines(
      ".env: &env { GEN: npx openapi-typescript }",
      "jobs:",
      "  a: { env: *env, steps: [{ run: $GEN a.yaml -it }] }",
      "  b: { env: *env }",
    );

    expect(migrated(text).text).toBe(
      lines(
        ".env: &env { GEN: npx openapi-typesafe }",
        "jobs:",
        "  a: { env: *env, steps: [{ run: $GEN a.yaml --immutable }] }",
        "  b: { env: *env }",
      ),
    );
  });

  it("migrateYamlCommands leaves an anchor that no command key uses", () => {
    const text = lines(".notes: &notes [made by openapi-typescript -it]", "about: *notes");

    expect(migrated(text).text).toBe(text);
  });
});

describe("fileMigrationFor and YAML aliases", () => {
  it("fileMigrationFor migrates the anchors that a CI file and a Taskfile use as commands", () => {
    const ci = lines(".s: &s [npx openapi-typescript a.yaml]", "job: { script: *s }");
    const task = lines(".c: &c npx openapi-typescript a.yaml", "tasks: { gen: { cmds: [*c] } }");

    const files = [
      [".gitlab-ci.yml", ci],
      ["Taskfile.yml", task],
    ] as const;

    for (const [name, text] of files) {
      const migrated = fileMigrationFor(name)?.(text, name, context).text;
      expect(migrated).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
    }
  });
});
