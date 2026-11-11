import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** A workflow with one step that runs `run` with `shell`. */
const workflow = (shell: string, run: string): string =>
  lines("jobs:", "  a:", "    steps:", `      - shell: ${shell}`, `        run: ${run}`);

describe("migrateYamlCommands and step shells", () => {
  it("migrateYamlCommands leaves a script of another language and reports its old names", () => {
    const text = workflow(
      "python",
      `subprocess.run(["npx", "openapi-typescript", "a.yaml", "-it"])`,
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "ci.yml:5", shell: "python" },
    ]);
  });

  it("migrateYamlCommands leaves a script that a shell would read as a command", () => {
    const text = workflow("ruby {0}", "system 'npx openapi-typescript a.yaml -it'");

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text);
    expect(migrated.changes).toEqual([]);
  });

  it("migrateYamlCommands reads the shell of a CircleCI run step next to its command", () => {
    const text = lines(
      "jobs:",
      "  a:",
      "    steps:",
      "      - run:",
      "          shell: python3",
      "          command: print('openapi-typescript')",
    );

    expect(migrateYamlCommands(text, "config.yml", stringsOf(text)).manualSteps).toEqual([
      { kind: "script-not-shell", location: "config.yml:6", shell: "python3" },
    ]);
  });

  it("migrateYamlCommands names the program of a shell given as a path with arguments", () => {
    const text = workflow("/usr/bin/perl {0}", "system('openapi-typescript a.yaml -it')");

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).manualSteps).toEqual([
      { kind: "script-not-shell", location: "ci.yml:5", shell: "/usr/bin/perl {0}" },
    ]);
  });

  it("migrateYamlCommands reports nothing for a script of another language without old names", () => {
    const text = workflow("python", "print('hello')");

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).manualSteps).toEqual([]);
  });

  it("migrateYamlCommands migrates the script of each shell it reads as commands", () => {
    for (const shell of ["bash", "sh -e {0}", "/bin/zsh {0}", "pwsh", "cmd"]) {
      const text = workflow(shell, "npx openapi-typescript a.yaml -it");

      expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).text).toBe(
        workflow(shell, "npx openapi-typesafe a.yaml --immutable"),
      );
    }
  });

  it("migrateYamlCommands reads the shell of a step for its own run only", () => {
    const text = lines(
      "jobs:",
      "  a:",
      "    steps:",
      "      - shell: python",
      "        run: print(1)",
      "      - run: npx openapi-typescript a.yaml -it",
    );

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).text).toContain(
      "run: npx openapi-typesafe a.yaml --immutable",
    );
  });
});
