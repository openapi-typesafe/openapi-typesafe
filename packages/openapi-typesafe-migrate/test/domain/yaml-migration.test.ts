import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import {
  LINT_STAGED_COMMAND_PATHS,
  MANIFEST_COMMAND_PATHS,
} from "../../src/domain/command-paths.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { TASKFILE_COMMAND_KEYS } from "../../src/domain/yaml-command-keys.js";
import {
  migrateDependabotConfig,
  migrateYamlCommands,
  migrateYamlPathCommands,
} from "../../src/domain/yaml-migration.js";

// The migrations take the strings that the YAML adapter reads; the tests read them with it.
const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("migrateYamlCommands", () => {
  it("migrateYamlCommands migrates commands in env values and leaves other text there", () => {
    const text = lines(
      "env:",
      "  GEN: npx openapi-typescript api.yaml -it",
      "  NOTE: made by openapi-typescript -it",
      "jobs:",
      "  a:",
      "    env: { RUN_GEN: 'openapi-typescript b.yaml', run: openapi-typescript -it }",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      lines(
        "env:",
        "  GEN: npx openapi-typesafe api.yaml --immutable",
        "  NOTE: made by openapi-typescript -it",
        "jobs:",
        "  a:",
        "    env: { RUN_GEN: 'openapi-typesafe b.yaml', run: openapi-typesafe --immutable }",
      ),
    );
  });

  it("migrateYamlCommands migrates the flags after an env variable set to the generator", () => {
    const [gen, flags] = ["$GEN", `"${["$", "{FLAGS}"].join("")}"`];
    const text = lines(
      "env:",
      "  GEN: openapi-typescript",
      "  FLAGS: -it",
      "jobs:",
      "  a:",
      "    steps:",
      `      - run: npx ${gen} a.yaml -it`,
      `      - run: openapi-typescript b.yaml ${flags}`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      lines(
        "env:",
        "  GEN: openapi-typesafe",
        "  FLAGS: -it",
        "jobs:",
        "  a:",
        "    steps:",
        `      - run: npx ${gen} a.yaml --immutable`,
        `      - run: openapi-typesafe b.yaml ${flags}`,
      ),
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "flags-in-variable", location: "ci.yml:8", variable: flags, flags: ["-it"] },
    ]);
  });

  it("migrateYamlCommands migrates commands and leaves other values", () => {
    const text = lines(
      "info:",
      "  description: Types are generated with openapi-typescript -it",
      "jobs:",
      "  gen:",
      "    steps:",
      "      - run: |",
      "          npx openapi-typescript ./api.yaml \\",
      "            --immutable-types",
      "      - run: npx openapi-typescript api.yaml --redoc=r.yaml",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      text
        .replaceAll("npx openapi-typescript", "npx openapi-typesafe")
        .replace("--immutable-types", "--immutable")
        .replace("--redoc=", "--redocly="),
    );
    expect(migrated.changes.map((change) => ("location" in change ? change.location : ""))).toEqual(
      ["ci.yml:7", "ci.yml:8", "ci.yml:9", "ci.yml:9"],
    );
  });

  it("migrateYamlCommands skips a here-document body of a run block", () => {
    const text = lines(
      "jobs:",
      "  gen:",
      "    steps:",
      "      - run: |",
      "          cat > NOTES <<'NOTE'",
      "          Don't edit: openapi-typescript -it",
      "          NOTE",
      "          npx openapi-typescript api.yaml -it",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      text.replace(
        "npx openapi-typescript api.yaml -it",
        "npx openapi-typesafe api.yaml --immutable",
      ),
    );
  });

  it("migrateYamlCommands reads a folded scalar as one command and keeps its line breaks", () => {
    const text = lines("script: >", "  openapi-typescript a", "  -it");

    const migrated = migrateYamlCommands(text, "x.yml", stringsOf(text));

    expect(migrated.text).toBe(lines("script: >", "  openapi-typesafe a", "  --immutable"));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands reports a pinned command", () => {
    const text = "command: npx openapi-typescript@7 a\n";

    const migrated = migrateYamlCommands(text, "compose.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([
      { kind: "versioned-command", location: "compose.yml:1" },
    ]);
  });

  it("migrateYamlCommands migrates commands in flow collections", () => {
    const text = lines(
      "command: [npx, openapi-typescript, a.yaml, -it]",
      "lint: {run: openapi-typescript b -it, glob: '*.yaml'}",
      'steps: [{run: "npx openapi-typescript c"}]',
    );

    const migrated = migrateYamlCommands(text, "x.yml", stringsOf(text));

    expect(migrated.text).toBe(
      lines(
        "command: [npx, openapi-typesafe, a.yaml, --immutable]",
        "lint: {run: openapi-typesafe b --immutable, glob: '*.yaml'}",
        'steps: [{run: "npx openapi-typesafe c"}]',
      ),
    );
  });

  it("migrateYamlCommands reads an exec-form list as one command, list by list", () => {
    const text = lines(
      "services:",
      "  gen:",
      "    command: [openapi-typescript, a.yaml, -it]",
      "    entrypoint:",
      "      - -it",
      "---",
      "command: [openapi-typescript, b.yaml, -it]",
    );

    const migrated = migrateYamlCommands(text, "compose.yml", stringsOf(text));

    expect(migrated.text).toBe(
      text
        .replaceAll("[openapi-typescript", "[openapi-typesafe")
        .replaceAll("yaml, -it]", "yaml, --immutable]"),
    );
  });

  it("migrateYamlCommands keeps a blank line of a folded scalar as a command break", () => {
    const text = lines("script: >", "  echo openapi-typescript", "", "  openapi-typescript a -it");

    const migrated = migrateYamlCommands(text, "x.yml", stringsOf(text));

    expect(migrated.text).toBe(
      text
        .replace("a -it", "a --immutable")
        .replace("  openapi-typescript a", "  openapi-typesafe a"),
    );
  });

  it("migrateYamlCommands reads a multi-line plain scalar as one command", () => {
    const text = lines("run: openapi-typescript a", "  -it");

    const migrated = migrateYamlCommands(text, "x.yml", stringsOf(text));

    expect(migrated.text).toBe(lines("run: openapi-typesafe a", "  --immutable"));
  });
});

describe("migrateYamlPathCommands", () => {
  it("migrateYamlPathCommands migrates the scripts of package.yaml by script name", () => {
    const text = lines(
      "dependencies:",
      "  openapi-fetch: ^0.13.0",
      "scripts:",
      "  gen: openapi-typescript a -it",
    );

    const migrated = migrateYamlPathCommands(text, stringsOf(text), MANIFEST_COMMAND_PATHS);

    expect(migrated.text).toBe(
      text.replace("openapi-typescript a -it", "openapi-typesafe a --immutable"),
    );
    expect(migrated.changes[0]).toEqual({ kind: "command-renamed", location: "scripts.gen" });
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlPathCommands migrates the commands of a lint-staged config by glob", () => {
    const text = lines(
      "'*.yaml':",
      "  - openapi-typescript api.yaml -it",
      "  - prettier --write",
      "api.json: openapi-typescript api.json -it",
    );

    const migrated = migrateYamlPathCommands(text, stringsOf(text), LINT_STAGED_COMMAND_PATHS);

    expect(migrated.text).toBe(
      text.replaceAll(/openapi-typescript (\S+) -it/g, "openapi-typesafe $1 --immutable"),
    );
    expect(
      migrated.changes.map((change) => change.kind === "command-renamed" && change.location),
    ).toEqual(["*.yaml.0", false, "api.json", false]);
  });
});

describe("migrateYamlCommands with the keys of a file kind", () => {
  it("migrateYamlCommands migrates Taskfile cmds, cmd, sh and status", () => {
    const text = lines(
      "vars:",
      "  V: { sh: openapi-typescript --version }",
      "tasks:",
      "  gen:",
      "    cmds:",
      "      - openapi-typescript a.yaml -it",
      "      - cmd: openapi-typescript b.yaml -it",
      "    status:",
      "      - openapi-typescript a.yaml --check",
      "    desc: openapi-typescript a.yaml",
    );

    const migrated = migrateYamlCommands(
      text,
      "Taskfile.yml",
      stringsOf(text),
      TASKFILE_COMMAND_KEYS,
    );

    expect(migrated.text).toBe(
      text
        .replaceAll("openapi-typescript --version", "openapi-typesafe --version")
        .replaceAll(/- (cmd: )?openapi-typescript/g, "- $1openapi-typesafe")
        .replaceAll(" -it", " --immutable"),
    );
  });

  it("migrateYamlCommands migrates Taskfile defer and short preconditions, not a task or msg", () => {
    const text = lines(
      "tasks:",
      "  gen:",
      "    preconditions:",
      "      - openapi-typescript --check a.yaml -it",
      "      - { sh: openapi-typescript --check b.yaml -it, msg: run openapi-typescript -it }",
      "    cmds:",
      "      - defer: openapi-typescript c.yaml -it",
      "      - defer: { task: openapi-typescript }",
    );

    const migrated = migrateYamlCommands(
      text,
      "Taskfile.yml",
      stringsOf(text),
      TASKFILE_COMMAND_KEYS,
    );

    expect(migrated.text).toBe(
      lines(
        "tasks:",
        "  gen:",
        "    preconditions:",
        "      - openapi-typesafe --check a.yaml --immutable",
        "      - { sh: openapi-typesafe --check b.yaml --immutable, msg: run openapi-typescript -it }",
        "    cmds:",
        "      - defer: openapi-typesafe c.yaml --immutable",
        "      - defer: { task: openapi-typescript }",
      ),
    );
  });
});

describe("migrateDependabotConfig", () => {
  it("migrateDependabotConfig renames every original package it names", () => {
    const text = lines(
      "updates:",
      "  - ignore:",
      '      - dependency-name: "openapi-typescript"',
      "      - dependency-name: openapi-fetch",
      "      - dependency-name: zod",
      "    groups:",
      "      api:",
      "        patterns:",
      "          - openapi-react-query",
      "          - 'openapi-*'",
    );

    const migrated = migrateDependabotConfig(text, ".github/dependabot.yml", stringsOf(text));

    expect(migrated.text).toBe(
      text
        .replace('"openapi-typescript"', '"openapi-typesafe"')
        .replace("name: openapi-fetch", "name: openapi-typesafe-fetch")
        .replace("- openapi-react-query", "- openapi-typesafe-react-query"),
    );
    expect(migrated.changes).toEqual([
      {
        kind: "package-name-renamed",
        location: ".github/dependabot.yml:3",
        from: "openapi-typescript",
        to: "openapi-typesafe",
      },
      {
        kind: "package-name-renamed",
        location: ".github/dependabot.yml:4",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
      {
        kind: "package-name-renamed",
        location: ".github/dependabot.yml:9",
        from: "openapi-react-query",
        to: "openapi-typesafe-react-query",
      },
    ]);
  });
});

describe("migrateYamlCommands and expressions", () => {
  it("migrateYamlCommands reports the flags after a variable that a step sets to another tool", () => {
    const expression = ["$", "{{ env.GEN }}"].join("");
    const text = lines(
      "env:",
      "  GEN: openapi-typescript",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: $GEN a.yaml -it",
      "      - env: { GEN: mytool }",
      `        run: ${expression} build -it`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text.replace("GEN: openapi-typescript", "GEN: openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "ci.yml:6",
        variable: "$GEN",
        flags: ["-it"],
      },
      {
        kind: "variable-not-only-generator",
        location: "ci.yml:8",
        variable: "$GEN",
        flags: ["-it"],
      },
    ]);
  });

  it("migrateYamlCommands reads an env expression as the variable it expands", () => {
    const expression = (name: string): string => ["$", "{{ env.", name, " }}"].join("");
    const text = lines(
      "env:",
      "  JG: openapi-typescript",
      "jobs:",
      "  a:",
      "    steps:",
      `      - run: npx ${expression("JG")} x.yaml -it`,
      `      - run: npx ${expression("OTHER")} y.yaml -it`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      lines(
        "env:",
        "  JG: openapi-typesafe",
        "jobs:",
        "  a:",
        "    steps:",
        `      - run: npx ${expression("JG")} x.yaml --immutable`,
        `      - run: npx ${expression("OTHER")} y.yaml -it`,
      ),
    );
  });

  it("migrateYamlCommands migrates the flags of the generator next to an empty env key", () => {
    const text = lines(
      "env:",
      '  "": openapi-typescript',
      "steps:",
      "  - run: openapi-typescript a.yaml -it",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      lines(
        "env:",
        '  "": openapi-typesafe',
        "steps:",
        "  - run: openapi-typesafe a.yaml --immutable",
      ),
    );
    expect(migrated.manualSteps).toEqual([]);
  });
});
