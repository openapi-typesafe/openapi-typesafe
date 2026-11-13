import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { shellCommands } from "../../src/domain/shell-words.js";
import { expressionLiterals, isWholeExpression } from "../../src/domain/workflow-expressions.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
/** `${{ body }}`, built so that no template literal holds the text `${`. */
const expression = (body: string): string => ["$", "{{ ", body, " }}"].join("");

describe("workflow expressions", () => {
  it("expressionLiterals gives the string literals of an expression with their offsets", () => {
    const raw = expression("inputs.a || 'npx openapi-typescript' || 'x'");

    expect(expressionLiterals(raw)).toEqual([
      { text: "npx openapi-typescript", start: 17 },
      { text: "x", start: 45 },
    ]);
  });

  it("expressionLiterals leaves out a literal with an escaped quote and one in shell quotes", () => {
    const raw = `${expression("'it''s' || 'b'")}'${expression("'c'")}'`;

    expect(expressionLiterals(raw)).toEqual([{ text: "b", start: 16 }]);
  });

  it("expressionLiterals reads a backslash as an escape and an unclosed expression to the end", () => {
    const raw = `\\'${["$", "{{ 'a'"].join("")}`;

    expect(expressionLiterals(raw)).toEqual([{ text: "a", start: 7 }]);
  });

  it("isWholeExpression tells a whole expression from a word that holds one", () => {
    const whole = expression("inputs.gen");

    const literal = expression("format('}}', a)");
    const unclosed = expression("'a");
    const words = [whole, `"${whole}"`, `${whole}x`, `x${whole}`, literal, unclosed];

    expect(words.map(isWholeExpression)).toEqual([true, true, false, false, true, false]);
  });

  it("shellCommands reads an expression with blanks as one word and its literals as commands", () => {
    const text = `${expression("inputs.gen || 'npx openapi-typescript'")} a.yaml`;

    const words = shellCommands(text).map((command) => command.map((word) => word.value));

    expect(words).toEqual([
      [expression("inputs.gen || 'npx openapi-typescript'"), "a.yaml"],
      ["npx", "openapi-typescript"],
    ]);
  });

  it("shellCommands reads an expansion in a literal, as the shell gets it", () => {
    const text = expression(["format('", "$", "{X:-npx openapi-typescript}')"].join(""));

    const words = shellCommands(text).map((command) => command.map((word) => word.value));

    expect(words.at(-1)).toEqual(["npx", "openapi-typescript"]);
  });

  it("shellCommands reads a literal of an expression before a shell default", () => {
    const text = `${expression("inputs.a || 'npx openapi-typescript'")}${["$", "{X:-y}"].join("")}`;

    const words = shellCommands(text).map((command) => command.map((word) => word.value));

    expect(words).toContainEqual(["npx", "openapi-typescript"]);
  });

  it("shellCommands reads a literal of an expression in a shell default once", () => {
    const inner = expression("inputs.gen || 'npx openapi-typescript'");
    const text = `${["$", "{GEN:-"].join("")}${inner}} a.yaml`;

    const words = shellCommands(text).map((command) => command.map((word) => word.raw));

    expect(words).toEqual([
      [text.replace(" a.yaml", ""), "a.yaml"],
      [inner],
      ["npx", "openapi-typescript"],
    ]);
  });
});

describe("migrateYamlCommands and workflow expressions", () => {
  it("migrateYamlCommands renames a literal in a shell default and reports the flags", () => {
    const program = `${["$", "{GEN:+"].join("")}${expression("inputs.gen || 'npx openapi-typescript'")}}`;
    const text = lines("jobs:", "  a:", "    steps:", `      - run: ${program} api.yaml -it`);

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text.replace("typescript'", "typesafe'"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "ci.yml:4",
        variable: program,
        flags: ["-it"],
      },
    ]);
  });

  it("migrateYamlCommands renames the generator in an expression default", () => {
    const text = lines(
      "jobs:",
      "  a:",
      "    steps:",
      `      - run: ${expression("inputs.gen || 'npx openapi-typescript'")} a.yaml -it`,
      `      - run: npx ${expression("inputs.pkg || 'openapi-typescript'")} b.yaml`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text.replaceAll("openapi-typescript'", "openapi-typesafe'"));
    expect(migrated.changes).toEqual([
      { kind: "command-renamed", location: "ci.yml:4" },
      { kind: "command-renamed", location: "ci.yml:5" },
    ]);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "ci.yml:4",
        variable: expression("inputs.gen || 'npx openapi-typescript'"),
        flags: ["-it"],
      },
    ]);
  });

  it("migrateYamlCommands migrates an input default and reports the flags where it runs", () => {
    const text = lines(
      "inputs:",
      "  command:",
      "    default: npx openapi-typescript",
      "  note: { default: made by openapi-typescript, description: openapi-typescript }",
      "runs:",
      "  steps:",
      `    - run: ${expression("inputs.command")} api.yaml -it`,
    );

    const migrated = migrateYamlCommands(text, "action.yml", stringsOf(text));

    expect(migrated.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "action.yml:4", word: "openapi-typescript" },
      {
        kind: "variable-not-only-generator",
        location: "action.yml:7",
        variable: expression("inputs.command"),
        flags: ["-it"],
      },
    ]);
  });

  it("migrateYamlCommands reads the input defaults of a reusable workflow", () => {
    const text = lines(
      "on:",
      "  workflow_call:",
      "    inputs:",
      "      gen: { type: string, default: openapi-typescript }",
      "  default: openapi-typescript",
      "jobs: { a: { default: openapi-typescript } }",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(
      text.replace("default: openapi-typescript }", "default: openapi-typesafe }"),
    );
  });
});
