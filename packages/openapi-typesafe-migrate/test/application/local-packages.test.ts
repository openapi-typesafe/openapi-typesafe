import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { manualStepMessage } from "../../src/application/manual-step-messages.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { isLocalPackageSpec } from "../../src/domain/version-spec.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const manifestOf = (dependencies: Readonly<Record<string, string>>) =>
  `${JSON.stringify({ dependencies })}\n`;
const IMPORT = 'import createClient from "openapi-fetch";\n';

async function migrated(project: Readonly<Record<string, string>>) {
  const dependencies = {
    files: new InMemoryProjectFiles(project),
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
    logger: new RecordingLogger(),
  };
  const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });
  const files = Object.fromEntries(dependencies.files.files);
  return { files, steps: migration.files.flatMap((file) => file.manualSteps) };
}

describe("migrateProject and local packages", () => {
  it.each(["workspace:*", "workspace:^", "link:../fork", "file:../fork", "portal:../fork"])(
    "migrateProject keeps and reports a dependency on a local package: %s",
    async (spec) => {
      const project = { "app/package.json": manifestOf({ "openapi-fetch": spec }) };

      const { files, steps } = await migrated(project);

      expect(files["app/package.json"]).toBe(project["app/package.json"]);
      expect(steps).toEqual([
        { kind: "local-package", field: "dependencies", name: "openapi-fetch", spec },
      ]);
    },
  );

  it("migrateProject keeps the imports of a local package in the files of its manifest", async () => {
    const project = {
      "app/package.json": manifestOf({ "openapi-fetch": "workspace:*" }),
      "app/src/a.ts": IMPORT,
      "web/package.json": manifestOf({ "openapi-fetch": "^0.13.0" }),
      "web/src/a.ts": IMPORT,
    };

    const { files } = await migrated(project);

    expect(files["app/src/a.ts"]).toBe(IMPORT);
    expect(files["web/src/a.ts"]).toBe('import createClient from "openapi-typesafe-fetch";\n');
    expect(files["web/package.json"]).toContain('"openapi-typesafe-fetch":"^1.0.0"');
  });

  it("migrateProject keeps the imports of a local package that a manifest above declares", async () => {
    const project = {
      "package.json": manifestOf({ "openapi-fetch": "link:./fork" }),
      "src/deep/a.ts": IMPORT,
    };

    const { files } = await migrated(project);

    expect(files["src/deep/a.ts"]).toBe(IMPORT);
  });

  it("migrateProject renames a package whose local spec belongs to another original name", async () => {
    const project = {
      "package.json": manifestOf({
        "openapi-typescript": "workspace:*",
        "openapi-fetch": "^0.13.0",
        other: "workspace:*",
      }),
      "src/a.ts": IMPORT,
    };

    const { files } = await migrated(project);

    expect(files["src/a.ts"]).toBe('import createClient from "openapi-typesafe-fetch";\n');
  });

  it("manualStepMessage names the local spec and the new package", () => {
    const step = {
      kind: "local-package",
      field: "dependencies",
      name: "openapi-fetch",
      spec: "workspace:*",
    } as const;

    expect(manualStepMessage(step)).toBe(
      'dependencies: openapi-fetch "workspace:*" points at a local package, not the npm ' +
        "package, so it and the imports of it were kept: if that package is a copy of the " +
        "original, move it to openapi-typesafe-fetch",
    );
  });

  it.each([
    ["workspace:*", true],
    ["^0.13.0", false],
    ["npm:openapi-fetch@^0.13", false],
    ["catalog:", false],
    ["https://example.com/link:fork.tgz", false],
  ])("isLocalPackageSpec of %s is %s", (spec, expected) => {
    expect(isLocalPackageSpec(spec)).toBe(expected);
  });

  it("migrateProject renames a Deno import map key with a file target with its imports", async () => {
    const project = {
      "deno.json": '{ "imports": { "openapi-fetch": "file:///vendor/fetch.ts" } }\n',
      "main.ts": IMPORT,
    };

    const { files } = await migrated(project);

    expect(files["deno.json"]).toContain('"openapi-typesafe-fetch": "file:///vendor/fetch.ts"');
    expect(files["main.ts"]).toBe('import createClient from "openapi-typesafe-fetch";\n');
  });
});
