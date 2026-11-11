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

  it.each([
    "/usr/bin/env bash -e {0}",
    "env -u CI LANG=C bash {0}",
    "env -S bash -e {0}",
    "env -C /work bash {0}",
    "msys2 {0}",
    "wsl-bash {0}",
    "C:\\msys64\\usr\\bin\\bash.exe {0}",
  ])("migrateYamlCommands reads the script of the shell %s as commands", (shell) => {
    const text = workflow(`'${shell}'`, "npx openapi-typescript a.yaml -it");

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toContain("run: npx openapi-typesafe a.yaml --immutable");
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands reports a script that env runs with another program", () => {
    const text = workflow("'/usr/bin/env -C /tmp python3 {0}'", "print('openapi-typescript')");

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).manualSteps).toEqual([
      { kind: "script-not-shell", location: "ci.yml:5", shell: "/usr/bin/env -C /tmp python3 {0}" },
    ]);
  });

  it("migrateYamlCommands reads the default shell of a workflow and of a job", () => {
    const text = lines(
      "defaults:",
      "  run:",
      "    shell: python",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: print('npx openapi-typescript a.yaml -it')",
      "  b:",
      "    defaults:",
      "      run:",
      "        shell: node {0}",
      "    steps:",
      "      - run: console.log('npx openapi-typescript a.yaml -it')",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "ci.yml:7", shell: "python" },
      { kind: "script-not-shell", location: "ci.yml:13", shell: "node {0}" },
    ]);
  });

  it("migrateYamlCommands takes the nearest shell: the step, then the job, then the workflow", () => {
    const text = lines(
      "defaults:",
      "  run:",
      "    shell: python",
      "jobs:",
      "  a:",
      "    defaults:",
      "      run:",
      "        shell: bash",
      "    steps:",
      "      - run: npx openapi-typescript a.yaml -it",
      "      - shell: python",
      "        run: print(1)",
      "  b:",
      "    steps:",
      "      - shell: bash",
      "        run: npx openapi-typescript b.yaml -it",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toContain("run: npx openapi-typesafe a.yaml --immutable");
    expect(migrated.text).toContain("run: npx openapi-typesafe b.yaml --immutable");
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands takes the own shell of a map before a default of the same map", () => {
    const text = lines(
      "defaults:",
      "  run:",
      "    shell: bash",
      "shell: python",
      "steps:",
      "  - run: print('openapi-typescript')",
    );

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).manualSteps).toEqual([
      { kind: "script-not-shell", location: "ci.yml:6", shell: "python" },
    ]);
  });

  it("migrateYamlCommands reads the shell of a CircleCI job for the commands of its steps", () => {
    const text = lines(
      "jobs:",
      "  build:",
      "    shell: /usr/bin/python3",
      "    steps:",
      "      - run:",
      "          command: print('npx openapi-typescript a.yaml -it')",
    );

    const migrated = migrateYamlCommands(text, "config.yml", stringsOf(text));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "config.yml:6", shell: "/usr/bin/python3" },
    ]);
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
