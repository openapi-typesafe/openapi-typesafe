import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const context = {
  version: "1.0.0",
  catalogs: NO_CATALOG_PLAN,
  manifests: [],
  aliases: [],
  apiDescriptionParts: new Set<string>(),
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
  it.each([
    "openapi: 3.1.0",
    'swagger: "2.0"',
    "swagger: 2.0",
    "asyncapi: 3.0.0",
    "overlay: 1.0.0",
    "arazzo: 1.0.1",
  ])("fileMigrationFor leaves an API description with %s as it is", (head) => {
    const text = documentWith(head);

    const migration = migrated("api/spec.yaml", text);

    expect(migration.text).toBe(text);
    expect(migration.changes).toEqual([]);
    expect(migration.manualSteps).toEqual([]);
  });

  it.each([
    ["a GitLab job named openapi", "openapi:\n  stage: build", "ci/jobs.yml"],
    ["a key with a name, not a version", "swagger: ui", "ci/jobs.yml"],
    ["an API description at a CI config path", "openapi: 3.1.0", "apps/a/.gitlab-ci.yml"],
    ["a CI config in a CI folder", "asyncapi: 3.0.0", "apps/a/.github/workflows/a.yml"],
  ])("fileMigrationFor migrates the commands of %s", (_, head, path) => {
    const text = `${head}\nscript:\n  - npx openapi-typescript spec.yaml -it\n`;

    expect(migrated(path, text).text).toBe(
      text.replace("typescript spec.yaml -it", "typesafe spec.yaml --immutable"),
    );
  });

  it("fileMigrationFor leaves an API description with a pre-release version", () => {
    const text = documentWith("openapi: 3.2.0-rc1");

    expect(migrated("api/spec.yaml", text).text).toBe(text);
  });

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

const EXAMPLE = "example:\n  command: npx openapi-typescript spec.yaml -it\n";
const MIGRATED_EXAMPLE = "npx openapi-typesafe spec.yaml --immutable";

/** The texts of a project's files after a migration with `--write`. */
async function migratedProject(project: Readonly<Record<string, string>>) {
  const files = new InMemoryProjectFiles(project);
  const dependencies = {
    ...{ files, rewriter: context.rewriter, scanner: context.scanner },
    ...{ readers: context.readers, logger: new RecordingLogger() },
  };
  await migrateProject(dependencies, { version: "1.0.0", isWrite: true });
  return Object.fromEntries(files.files);
}

describe("migrateProject and the files of a split API description", () => {
  it("migrateProject leaves the files that an API description reaches by $ref", async () => {
    const project = {
      "spec/openapi.yaml": "openapi: 3.1.0\npaths:\n  /a:\n    $ref: ./paths/a.yaml#/a\n",
      "spec/paths/a.yaml": `a:\n  $ref: '../schemas/Job.yaml'\n${EXAMPLE}`,
      "spec/schemas/Job.yaml": `type: object\n${EXAMPLE}`,
      "ci/build.yml": EXAMPLE,
    };

    const files = await migratedProject(project);

    expect(files["spec/paths/a.yaml"]).toBe(project["spec/paths/a.yaml"]);
    expect(files["spec/schemas/Job.yaml"]).toBe(project["spec/schemas/Job.yaml"]);
    expect(files["ci/build.yml"]).toContain(MIGRATED_EXAMPLE);
  });

  it("migrateProject leaves a YAML file that a JSON API description reaches by $ref", async () => {
    const project = {
      "openapi.json": '{"openapi":"3.1.0","components":{"schemas":{"J":{"$ref":"./j.yaml"}}}}\n',
      "j.yaml": EXAMPLE,
    };

    const files = await migratedProject(project);

    expect(files["j.yaml"]).toBe(EXAMPLE);
  });

  it.each([
    ["a reference inside the description", "'#/components/schemas/J'"],
    ["a URL", "https://example.com/j.yaml"],
    ["a path outside the project", "../../j.yaml"],
    ["a file that is not listed", "./missing.yaml"],
  ])("migrateProject migrates a YAML file that no $ref names, with %s", async (_, ref) => {
    const project = {
      "spec/openapi.yaml": `openapi: 3.1.0\ncomponents:\n  schemas:\n    J:\n      $ref: ${ref}\n`,
      "spec/j.yaml": EXAMPLE,
    };

    const files = await migratedProject(project);

    expect(files["spec/j.yaml"]).toContain(MIGRATED_EXAMPLE);
  });

  it("migrateProject migrates a YAML file that an API description names in a value other than $ref", async () => {
    const project = {
      "openapi.yaml": "openapi: 3.1.0\ninfo:\n  description: ./ci.yaml\n",
      "ci.yaml": EXAMPLE,
    };

    const files = await migratedProject(project);

    expect(files["ci.yaml"]).toContain(MIGRATED_EXAMPLE);
  });

  it("migrateProject follows no $ref into a file that is not YAML or JSON", async () => {
    const project = {
      "openapi.yaml": "openapi: 3.1.0\ncomponents:\n  $ref: ./notes.txt\n",
      "notes.txt": '{ "$ref": "./ci.yaml" }\n',
      "ci.yaml": EXAMPLE,
    };

    const files = await migratedProject(project);

    expect(files["ci.yaml"]).toContain(MIGRATED_EXAMPLE);
  });

  it("migrateProject migrates a YAML file that a file other than an API description names", async () => {
    const project = { "config.yaml": "include:\n  $ref: ./ci.yaml\n", "ci.yaml": EXAMPLE };

    const files = await migratedProject(project);

    expect(files["ci.yaml"]).toContain(MIGRATED_EXAMPLE);
  });

  it("migrateProject reads a $ref from no CI config and into no CI config", async () => {
    const project = {
      ".gitlab-ci.yml": "openapi: 3.1.0\njobs:\n  $ref: ./ci/a.yaml\n",
      "ci/a.yaml": EXAMPLE,
      "openapi.yaml": "openapi: 3.1.0\ncomponents:\n  $ref: ./.circleci/config.yml\n",
      ".circleci/config.yml": EXAMPLE,
    };

    const files = await migratedProject(project);

    expect(files["ci/a.yaml"]).toContain(MIGRATED_EXAMPLE);
    expect(files[".circleci/config.yml"]).toContain(MIGRATED_EXAMPLE);
  });

  it("migrateProject leaves a part that an indented API key does not make a description", async () => {
    const project = {
      "openapi.yaml": "openapi: 3.1.0\ncomponents:\n  $ref: ./part.yaml\n",
      "part.yaml": `info:\n  openapi: 3.1.0\n${EXAMPLE}`,
    };

    const files = await migratedProject(project);

    expect(files["part.yaml"]).toBe(project["part.yaml"]);
  });
});
