import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const context = {
  version: "1.0.0",
  catalogs: NO_CATALOG_PLAN,
  manifests: [],
  aliases: [],
  rewriter: new StubCallbackRewriter(),
  scanner: new QuotedStringScanner(),
  readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
};

/** A YAML file with a top-level `head` line and a `command` example that runs the generator. */
const documentWith = (head: string) =>
  `${head}\nexample:\n  command: npx openapi-typescript spec.yaml -it\n`;

function migrated(path: string, text: string) {
  const migrate = fileMigrationFor(path);
  if (migrate === undefined) {
    throw new Error(`no migration for ${path}`);
  }
  return migrate(text, path, context);
}

describe("fileMigrationFor and API descriptions", () => {
  it.each(["openapi: 3.1.0", 'swagger: "2.0"', "swagger: 2.0", "asyncapi: 3.0.0"])(
    "fileMigrationFor leaves an API description with %s as it is",
    (head) => {
      const text = documentWith(head);

      const migration = migrated("api/spec.yaml", text);

      expect(migration.text).toBe(text);
      expect(migration.changes).toEqual([]);
      expect(migration.manualSteps).toEqual([]);
    },
  );

  it("fileMigrationFor leaves an API description that is the second document of a stream", () => {
    const text = `name: other\n---\n${documentWith("openapi: 3.0.3")}`;

    expect(migrated("api/spec.yml", text).text).toBe(text);
  });

  it.each(["name: compose", "info:\n  openapi: 3.1.0"])(
    "fileMigrationFor migrates the commands of a YAML file without a top-level API key: %s",
    (head) => {
      const migration = migrated("docker-compose.yml", documentWith(head));

      expect(migration.text).toContain("npx openapi-typesafe spec.yaml --immutable");
    },
  );
});
