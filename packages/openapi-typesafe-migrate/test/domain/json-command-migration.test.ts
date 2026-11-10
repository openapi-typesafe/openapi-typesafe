import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import {
  DENO_TASK_PATHS,
  MANIFEST_COMMAND_PATHS,
  NX_PROJECT_COMMAND_PATHS,
  NX_WORKSPACE_COMMAND_PATHS,
} from "../../src/domain/command-paths.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { migrateJsonCommands } from "../../src/domain/json-command-migration.js";

// The migration takes the strings that the JSON adapter reads; the tests read them with it.
const json = createJsonTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = json.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

describe("migrateJsonCommands", () => {
  it("migrateJsonCommands migrates Nx target commands in place", () => {
    const text = [
      "{",
      '  "name": "api",',
      '  "description": "openapi-typescript api.yaml -it",',
      '  "targets": {',
      '    "gen": { "options": { "command": "openapi-typescript api.yaml -it" } },',
      '    "all": { "options": { "commands": ["npx openapi-typescript a", { "command": "x" }] } },',
      '    "short": { "command": "pnpm exec openapi-typescript b" }',
      "  }",
      "}",
    ].join("\n");

    const migrated = migrateJsonCommands(text, stringsOf(text), NX_PROJECT_COMMAND_PATHS);

    expect(migrated.text).toBe(
      text
        .replace('"openapi-typescript api.yaml -it" }', '"openapi-typesafe api.yaml --immutable" }')
        .replace("npx openapi-typescript a", "npx openapi-typesafe a")
        .replace("exec openapi-typescript b", "exec openapi-typesafe b"),
    );
    expect(migrated.changes.map((change) => ("location" in change ? change.location : ""))).toEqual(
      [
        "targets.gen.options.command",
        "targets.gen.options.command",
        "targets.all.options.commands.0",
        "targets.short.command",
      ],
    );
  });

  it("migrateJsonCommands migrates Deno tasks, as strings and as objects", () => {
    const text =
      '{\n  // tasks\n  "tasks": {\n    "gen": "deno run -A npm:openapi-typescript a",\n' +
      '    "obj": { "command": "deno run npm:openapi-typescript@7 b" },\n  },\n}\n';

    const migrated = migrateJsonCommands(text, stringsOf(text), DENO_TASK_PATHS);

    expect(migrated.text).toBe(text.replace("npm:openapi-typescript a", "npm:openapi-typesafe a"));
    expect(migrated.manualSteps).toEqual([
      { kind: "versioned-command", location: "tasks.obj.command" },
    ]);
  });

  it("migrateJsonCommands migrates the hook tools and Nx targets of a manifest", () => {
    const text = JSON.stringify({
      "simple-git-hooks": { "pre-commit": "npx openapi-typescript a -it" },
      "lint-staged": { "*.yaml": ["openapi-typescript b -it"], "*.json": "openapi-typescript c" },
      nx: { targets: { gen: { command: "openapi-typescript d" } } },
      description: "openapi-typescript e",
    });

    const migrated = migrateJsonCommands(text, stringsOf(text), MANIFEST_COMMAND_PATHS);

    expect(
      migrated.changes.map((change) => change.kind === "command-renamed" && change.location),
    ).toEqual([
      "simple-git-hooks.pre-commit",
      false,
      "lint-staged.*.yaml.0",
      false,
      "lint-staged.*.json",
      "nx.targets.gen.command",
    ]);
    expect(JSON.parse(migrated.text).description).toBe("openapi-typescript e");
  });

  it("migrateJsonCommands migrates the target defaults of nx.json", () => {
    const text = JSON.stringify({
      targetDefaults: {
        gen: { command: "openapi-typescript a" },
        "nx:run-commands": { options: { commands: ["openapi-typescript b"] } },
      },
    });

    const migrated = migrateJsonCommands(text, stringsOf(text), NX_WORKSPACE_COMMAND_PATHS);

    expect(migrated.text).toBe(text.replaceAll("openapi-typescript", "openapi-typesafe"));
  });
});
