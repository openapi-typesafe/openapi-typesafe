import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import type { ManualStep } from "../../src/domain/migration-findings.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const ALIAS = "npm:openapi-typesafe-fetch@^1.0.0-rc";
const DEPENDENCIES = { "swr-openapi": "^5.0.0", "openapi-typesafe-fetch": "^1.0.0" };
const json = (value: unknown) => `${JSON.stringify(value)}\n`;

async function stepsOf(project: Readonly<Record<string, string>>): Promise<ManualStep[]> {
  const dependencies = {
    files: new InMemoryProjectFiles(project),
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
    logger: new RecordingLogger(),
  };
  const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });
  return migration.files.flatMap((file) => file.manualSteps);
}

describe("migrateProject and overrides that alias an original package to its successor", () => {
  it.each([
    ["overrides", { "openapi-fetch": ALIAS }],
    ["resolutions", { "**/openapi-fetch": ALIAS }],
    ["overrides", { "swr-openapi": { "openapi-fetch": ALIAS } }],
    ["pnpm", { overrides: { "swr-openapi>openapi-fetch": ALIAS } }],
  ])("migrateProject reports nothing for the alias in package.json %s", async (field, value) => {
    const project = { "package.json": json({ dependencies: DEPENDENCIES, [field]: value }) };

    expect(await stepsOf(project)).toEqual([]);
  });

  it("migrateProject reports nothing for the alias in a pnpm-workspace.yaml above", async () => {
    const project = {
      "pnpm-workspace.yaml": `packages: [app]\noverrides:\n  openapi-fetch: ${ALIAS}\n`,
      "app/package.json": json({ dependencies: DEPENDENCIES }),
    };

    expect(await stepsOf(project)).toEqual([]);
  });

  it("migrateProject asks for the alias when only another folder has it", async () => {
    const project = {
      "a/package.json": json({ dependencies: DEPENDENCIES, overrides: { "openapi-fetch": ALIAS } }),
      "b/package.json": json({ dependencies: DEPENDENCIES }),
    };

    expect((await stepsOf(project)).map((step) => step.kind)).toEqual(["old-peer-needed"]);
  });

  it.each([
    ["an older version", "npm:openapi-fetch@0.13.0"],
    ["another package", "npm:my-fetch@1.0.0"],
    ["a range", "0.13.0"],
    ["the new name without npm:", "openapi-typesafe-fetch"],
  ])("migrateProject still reports an override to %s", async (_label, spec) => {
    const project = {
      "package.json": json({ dependencies: DEPENDENCIES, overrides: { "openapi-fetch": spec } }),
    };

    expect((await stepsOf(project)).map((step) => step.kind)).toEqual([
      "override-names-package",
      "old-peer-needed",
    ]);
  });

  it("migrateProject reports the other packages of an override map with an alias", async () => {
    const overrides = { "openapi-fetch": ALIAS, typescript: "npm:openapi-typescript@7.13.0" };
    const project = { "package.json": json({ dependencies: DEPENDENCIES, overrides }) };

    expect(await stepsOf(project)).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-typescript" },
    ]);
  });
});
