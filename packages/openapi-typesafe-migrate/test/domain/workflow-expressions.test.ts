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

  it("migrateYamlCommands reports the old flags of an input default where they are passed", () => {
    const text = lines(
      "inputs:",
      "  flags: { default: --immutable-types }",
      "  more: { default: -it }",
      "  other: { default: -x }",
      "runs:",
      "  steps:",
      `    - run: npx openapi-typescript a.yaml ${expression("inputs.flags")}`,
      `    - run: npx openapi-typescript a.yaml "${expression("inputs.more")}"`,
      `    - run: npx openapi-typescript a.yaml ${expression("inputs.other")}`,
    );

    const migrated = migrateYamlCommands(text, "action.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([
      {
        kind: "flags-in-variable",
        location: "action.yml:7",
        variable: expression("inputs.flags"),
        flags: ["--immutable-types"],
      },
      {
        kind: "flags-in-variable",
        location: "action.yml:8",
        variable: `"${expression("inputs.more")}"`,
        flags: ["-it"],
      },
    ]);
  });

  it("migrateYamlCommands reads the defaults of one input name in a workflow as one", () => {
    const text = lines(
      "on:",
      "  workflow_call: { inputs: { flags: { default: -it } } }",
      "  workflow_dispatch: { inputs: { flags: { default: -x } } }",
      "jobs:",
      "  a:",
      "    steps:",
      `      - run: npx openapi-typescript a.yaml ${expression("inputs.flags")}`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([
      {
        kind: "flags-in-variable",
        location: "ci.yml:7",
        variable: expression("inputs.flags"),
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

describe("workflow expressions in other forms", () => {
  /** A step that says a word or a variable holds old flags. */
  const flagsStep = (location: string, variable: string, flags: string[]) => ({
    kind: "flags-in-variable",
    location,
    variable,
    flags,
  });
  const workflow = (...steps: string[]): string =>
    lines(
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      gen: { default: npx openapi-typescript }",
      "      flags: { default: -it }",
      "jobs:",
      "  a:",
      `    env: { FL: "${expression("inputs.flags")}", OUT: "-o ${expression("inputs.out")} -ap" }`,
      "    container: { env: { TOOL: mytool } }",
      "    steps:",
      ...steps.map((step) => `      - run: ${step}`),
    );

  it("migrateYamlCommands reports the old flags of an input read through github.event", () => {
    const word = expression("github.event.inputs.flags");
    const text = workflow(`npx openapi-typescript a.yaml ${word}`);

    const migrated = migrateYamlCommands(text, "gen.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([flagsStep("gen.yml:11", word, ["-it"])]);
  });

  it("migrateYamlCommands reads an input only by its own name in an expression", () => {
    const text = workflow(`npx openapi-typescript a.yaml ${expression("matrix.inputs.flags")}`);

    expect(migrateYamlCommands(text, "gen.yml", stringsOf(text)).manualSteps).toEqual([]);
  });

  it("migrateYamlCommands reports the old flags of an input that an env value holds", () => {
    const [fl, out] = [["$", "FL"].join(""), ["$", "OUT"].join("")] as const;
    const text = workflow(`npx openapi-typescript a.yaml ${fl} ${out}`);

    const migrated = migrateYamlCommands(text, "gen.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([
      flagsStep("gen.yml:11", fl, ["-it"]),
      flagsStep("gen.yml:11", out, ["-ap"]),
    ]);
  });

  it("migrateYamlCommands reports an old flag in the literal of an expression argument", () => {
    const word = expression("matrix.flags || '-ap'");
    const text = workflow(`npx openapi-typescript a.yaml ${word} ${expression("matrix.x")}`);

    const migrated = migrateYamlCommands(text, "gen.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([flagsStep("gen.yml:11", word, ["-ap"])]);
  });

  it("migrateYamlCommands reports the flags after a shell default that is an input", () => {
    const program = `${["$", "{TOOL-"].join("")}${expression("inputs.gen")}}`;
    const text = workflow(`${program} e.yaml -it`);

    const migrated = migrateYamlCommands(text, "gen.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "gen.yml:11",
        variable: program,
        flags: ["-it"],
      },
    ]);
  });

  it("migrateYamlCommands reports the flags after a shell default for an unset variable", () => {
    const program = ["$", "{GEN:-mytool}"].join("");
    const alternative = ["$", "{GEN:+mytool}"].join("");
    const text = workflow(`${program} e.yaml -it`, `${alternative} e.yaml -it`);

    const migrated = migrateYamlCommands(text, "gen.yml", stringsOf(text));

    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "gen.yml:11",
        variable: program,
        flags: ["-it"],
      },
    ]);
  });
});
