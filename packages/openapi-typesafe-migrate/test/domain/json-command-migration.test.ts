import { describe, expect, it } from "vitest";
import {
  DENO_TASK_PATHS,
  migrateJsonCommands,
  NX_COMMAND_PATHS,
} from "../../src/domain/json-command-migration.js";

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

    const migrated = migrateJsonCommands(text, NX_COMMAND_PATHS);

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

    const migrated = migrateJsonCommands(text, DENO_TASK_PATHS);

    expect(migrated.text).toBe(text.replace("npm:openapi-typescript a", "npm:openapi-typesafe a"));
    expect(migrated.manualSteps).toEqual([
      { kind: "versioned-command", location: "tasks.obj.command" },
    ]);
  });

  it("migrateJsonCommands reports a broken config that names an original package", () => {
    expect(migrateJsonCommands('{ "tasks": { "a": "openapi-typescript" ', DENO_TASK_PATHS)).toEqual(
      {
        text: '{ "tasks": { "a": "openapi-typescript" ',
        changes: [],
        manualSteps: [{ kind: "config-unreadable" }],
      },
    );
    expect(migrateJsonCommands("{ broken", DENO_TASK_PATHS).manualSteps).toEqual([]);
  });
});
