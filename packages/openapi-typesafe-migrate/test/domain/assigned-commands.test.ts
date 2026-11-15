import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateCommandLines } from "../../src/domain/command-migration.js";
import { usedDocumentStrings } from "../../src/domain/config-documents.js";
import { runsGenerator } from "../../src/domain/file-variables.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";
import { shellCommands } from "../../src/domain/shell-words.js";
import { GITLAB_CI_FILE } from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function migrateGitlab(text: string) {
  const read = yaml.read(text);
  const strings = read.kind === "read" ? usedDocumentStrings(read.documents) : [];
  return migrateYamlCommands(text, ".gitlab-ci.yml", strings, GITLAB_CI_FILE);
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const migrate = (text: string) => migrateCommandLines(text, "gen.bash");
const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

describe("migrateCommandLines and appended commands", () => {
  it("migrateCommandLines reports flags appended after an appended generator command", () => {
    const text = lines('H+="npx openapi-typescript"', 'H+=" -it"', "$H api.yaml");

    const migrated = migrate(text);

    expect(migrated.text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "gen.bash:2",
        variable: "$H",
        flags: ["-it"],
      },
    ]);
  });

  it("migrateCommandLines renames flags appended after a generator command it sets", () => {
    const text = lines('H="npx openapi-typescript"', 'H+=" -it"', "$H api.yaml");

    expect(migrate(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateCommandLines keeps flags appended only to a value from outside", () => {
    const text = lines('H+=" -it"', 'H+=" --redoc r.yaml"', "$H api.yaml");

    expect(migrate(text)).toMatchObject({ text, manualSteps: [] });
  });
});

describe("migrateYamlCommands and text appended to a job variable", () => {
  it.each([
    [["    - GEN+=' --redoc r.yaml'", "    - $GEN a.yaml -it"]],
    [["    - A=x; GEN+=' --redoc r.yaml'; $GEN a.yaml -it"]],
  ])("migrateYamlCommands keeps the job's generator variable after appends %j", (script) => {
    const text = lines(
      "gen:",
      "  variables:",
      "    GEN: npx openapi-typescript",
      "  script:",
      ...script,
    );

    const migrated = migrateGitlab(text);

    expect(migrated.text).toBe(renamed(text).replace("--redoc ", "--redocly "));
    expect(migrated.manualSteps).toEqual([]);
  });
});

describe("migrateMakefile and make assignments in arguments", () => {
  it.each([["GEN:="], ["GEN::="], ["GEN:::="], ["GEN?="], ["GEN+="], ["GEN="], ["my.gen-1:="]])(
    "migrateMakefile renames the command of the argument %s of a sub-make",
    (head) => {
      const text = lines("sub:", `\t$(MAKE) -C api ${head}"npx openapi-typescript -it"`);

      expect(migrateMakefile(text, "Makefile").text).toBe(renamed(text));
    },
  );

  it("migrateMakefile renames the command that a make != argument runs", () => {
    const text = lines("sub:", '\t$(MAKE) GEN!="openapi-typescript -it"');

    expect(migrateMakefile(text, "Makefile").text).toBe(renamed(text));
  });
});

describe("runsGenerator", () => {
  it.each([
    ["openapi-typescript a.yaml", true],
    ["node_modules/.bin/openapi-typescript a.yaml", true],
    ["./node_modules/.bin/openapi-typescript.cmd a.yaml", true],
    ["/usr/local/bin/openapi-typescript a.yaml", false],
    ["node_modules/openapi-typescript/bin/cli.js a.yaml", false],
    ["openapi-typescript-helpers a.yaml", false],
  ])("runsGenerator of %s is %s", (line, expected) => {
    expect(runsGenerator(shellCommands(line)[0] ?? [])).toBe(expected);
  });
});

describe("migrateCommandLines and generator paths in assignments", () => {
  it("migrateCommandLines renames the flags after a variable set to the generator's bin", () => {
    const text = lines("GEN=node_modules/.bin/openapi-typescript", "$GEN a.yaml -it");

    expect(migrate(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateCommandLines reports a variable set to a pinned generator path once", () => {
    const text = lines("GEN=/opt/bin/openapi-typescript", "$GEN a.yaml -it");

    const migrated = migrate(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "gen.bash:1", word: "/opt/bin/openapi-typescript" },
    ]);
  });

  it("migrateCommandLines reports the old name in an assignment once, as its program", () => {
    const text = lines("DOCS=https://x.dev/openapi-typescript npx openapi-typescript a");

    const migrated = migrate(text);

    expect(migrated.text).toBe(
      lines("DOCS=https://x.dev/openapi-typescript npx openapi-typesafe a"),
    );
    expect(migrated.manualSteps).toEqual([
      {
        kind: "old-name-in-command",
        location: "gen.bash:1",
        word: "https://x.dev/openapi-typescript",
      },
    ]);
  });
});
