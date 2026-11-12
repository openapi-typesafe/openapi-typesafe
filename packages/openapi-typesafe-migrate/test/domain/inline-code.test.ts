import { describe, expect, it } from "vitest";
import { migrateCommand } from "../../src/domain/command-migration.js";

/**
 * Code given to an interpreter on the command line is code of that language: the migration
 * leaves it as it is and reports it when it names an old package.
 */

const PYTHON_CODE = `'import subprocess; subprocess.run(["npx", "openapi-typescript", "f.yaml"])'`;

describe("migrateCommand and inline code", () => {
  it.each([
    ["python3", `python3 -c ${PYTHON_CODE}`],
    ["/usr/bin/python3.12", `/usr/bin/python3.12 -I -c ${PYTHON_CODE}`],
    ["py", `py -c ${PYTHON_CODE}`],
    ["node", `node -e "require('child_process').execSync('npx openapi-typescript a.yaml -it')"`],
    ["node.exe", `node.exe --print "'openapi-fetch'"`],
    ["bun", `bun --eval "await $\`openapi-typescript a.yaml\`"`],
    ["ruby", `ruby -e 'system "openapi-typescript a.yaml -it"'`],
    ["perl", `perl -E 'system "openapi-typescript a.yaml -it"'`],
  ])("migrateCommand leaves the inline code of %s and reports it", (shell, script) => {
    const migrated = migrateCommand(script, "scripts.f");

    expect(migrated.text).toBe(script);
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "scripts.f", shell },
    ]);
  });

  it("migrateCommand reads the inline code of an interpreter that a launcher runs", () => {
    const script = `npx -p openapi-typescript node -e "console.log('openapi-typescript -it')"`;

    const migrated = migrateCommand(script, "scripts.f");

    expect(migrated.text).toBe(script.replace("-p openapi-typescript", "-p openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "scripts.f", shell: "node" },
    ]);
  });

  it("migrateCommand reports nothing for inline code without old names", () => {
    expect(migrateCommand(`python3 -c 'print("openapi-typesafe")'`, "x").manualSteps).toEqual([]);
  });

  it.each([
    ["an option for the script", `node a.js -e "openapi-typescript a.yaml -it"`],
    ["a program without code options", `sh -c "openapi-typescript a.yaml -it"`],
  ])("migrateCommand reads a quoted command line after %s", (_, script) => {
    const migrated = migrateCommand(script, "x");

    expect(migrated.text).toContain('"openapi-typesafe a.yaml --immutable"');
  });
});
