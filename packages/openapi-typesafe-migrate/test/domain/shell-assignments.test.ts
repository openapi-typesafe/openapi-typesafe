import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateCommand, migrateCommandLines } from "../../src/domain/command-migration.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { assignmentValueText, shellAssignments } from "../../src/domain/shell-assignments.js";
import { shellCommands } from "../../src/domain/shell-words.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const GEN = ["$", "GEN"].join("");
const BRACED_GEN = ["$", "{GEN}"].join("");

/** The assignments of the first command of `text`, as name and value. */
const assignmentsOf = (text: string) =>
  shellAssignments(shellCommands(text)[0] ?? []).map(({ name, value }) => ({ name, value }));

describe("shellAssignments", () => {
  it("shellAssignments reads assignments before a command and as builtin arguments", () => {
    expect(assignmentsOf("A=1 B='x y' run C=2")).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "x y" },
    ]);
    expect(assignmentsOf("export GEN=a FLAGS=b")).toEqual([
      { name: "GEN", value: "a" },
      { name: "FLAGS", value: "b" },
    ]);
    for (const builtin of ["local", "readonly", "declare", "typeset"]) {
      expect(assignmentsOf(`${builtin} GEN=a`)).toEqual([{ name: "GEN", value: "a" }]);
    }
  });

  it("shellAssignments reads no arguments of a command that is not a declaration", () => {
    expect(assignmentsOf("echo GEN=a")).toEqual([]);
  });
});

describe("assignmentValueText", () => {
  const assignedText = (text: string) => {
    const [assignment] = shellAssignments(shellCommands(text)[0] ?? []);
    return assignment === undefined ? undefined : assignmentValueText(assignment);
  };

  it("assignmentValueText gives a plain or one quoted value with its offset", () => {
    expect(assignedText("GEN=npx")).toEqual({ text: "npx", start: 4 });
    expect(assignedText(`GEN="npx a"`)).toEqual({ text: "npx a", start: 5 });
    expect(assignedText("GEN='npx a'")).toEqual({ text: "npx a", start: 5 });
  });

  it("assignmentValueText gives nothing for a value of several parts or an expansion", () => {
    expect(assignedText(`GEN="npx"' a'`)).toBeUndefined();
    expect(assignedText(`GEN="npx"x"a"`)).toBeUndefined();
    expect(assignedText(`GEN="npx`)).toBeUndefined();
    expect(assignedText(`GEN=${GEN}x`)).toBeUndefined();
    expect(assignedText("GEN=a\\ b")).toBeUndefined();
  });
});

describe("migrateCommandLines and shell variables", () => {
  it("migrateCommandLines migrates a variable set to the generator and the flags of its uses", () => {
    const text = lines(
      `GEN="npx openapi-typescript"`,
      `${GEN} a.yaml -it`,
      `export OAT=openapi-typescript; "${BRACED_GEN}" b.yaml -it`,
      "$OAT c.yaml -it",
    );

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(
      lines(
        `GEN="npx openapi-typesafe"`,
        `${GEN} a.yaml --immutable`,
        `export OAT=openapi-typesafe; "${BRACED_GEN}" b.yaml --immutable`,
        "$OAT c.yaml --immutable",
      ),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateCommandLines reports old flags in a variable that the generator gets", () => {
    const text = lines("FLAGS=-it", "openapi-typescript a.yaml $FLAGS");

    expect(migrateCommandLines(text, "gen.sh").manualSteps).toEqual([
      { kind: "flags-in-variable", location: "gen.sh:2", variable: "$FLAGS", flags: ["-it"] },
    ]);
  });

  it("migrateCommandLines leaves the flags of a variable that is set to another tool too", () => {
    const text = lines("GEN=openapi-typescript", "GEN=prettier", `${GEN} a.yaml -it`);

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(lines("GEN=openapi-typesafe", "GEN=prettier", `${GEN} a.yaml -it`));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "gen.sh:3",
        variable: GEN,
        flags: ["-it"],
      },
    ]);
  });

  it("migrateCommand migrates a package.json script that sets the generator variable", () => {
    const script = `GEN='npx openapi-typescript' && ${GEN} a.yaml -it`;

    expect(migrateCommand(script, "scripts.gen").text).toBe(
      `GEN='npx openapi-typesafe' && ${GEN} a.yaml --immutable`,
    );
  });
});

describe("migrateYamlCommands and shell variables", () => {
  it("migrateYamlCommands migrates a run block that sets the generator variable", () => {
    const text = lines(
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |",
      `          GEN="npx openapi-typescript"`,
      `          ${GEN} a.yaml -it`,
    );

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).text).toBe(
      lines(
        "jobs:",
        "  a:",
        "    steps:",
        "      - run: |",
        `          GEN="npx openapi-typesafe"`,
        `          ${GEN} a.yaml --immutable`,
      ),
    );
  });

  it("migrateYamlCommands keeps an env variable when a run block sets other variables", () => {
    const text = lines(
      "env:",
      "  GEN: openapi-typescript",
      "jobs:",
      "  a:",
      "    steps:",
      `      - run: OUT=a.ts; ${GEN} a.yaml -it`,
    );

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).text).toContain(
      `OUT=a.ts; ${GEN} a.yaml --immutable`,
    );
  });

  it("migrateYamlCommands reads an env variable and a run assignment of one name as one", () => {
    const text = lines(
      "env:",
      "  GEN: prettier",
      "jobs:",
      "  a:",
      "    steps:",
      `      - run: GEN=openapi-typescript; ${GEN} a.yaml -it`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toContain(`GEN=openapi-typesafe; ${GEN} a.yaml -it`);
    expect(migrated.manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", variable: GEN }),
    ]);
  });
});
