import { describe, expect, it } from "vitest";
import { migrateCommand, migrateCommandLines } from "../../src/domain/command-migration.js";

describe("migrateCommand and Windows program suffixes", () => {
  it.each([
    ["openapi-typescript.cmd a.yaml -it", "openapi-typesafe.cmd a.yaml --immutable"],
    ["openapi-typescript.ps1 a.yaml", "openapi-typesafe.ps1 a.yaml"],
    ['"openapi-typescript.EXE" a.yaml -it', '"openapi-typesafe.EXE" a.yaml --immutable'],
    [
      "node_modules\\.bin\\openapi-typescript.cmd a.yaml -it",
      "node_modules\\.bin\\openapi-typesafe.cmd a.yaml --immutable",
    ],
    [
      '"node_modules\\.bin\\openapi-typescript.cmd" a.yaml',
      '"node_modules\\.bin\\openapi-typesafe.cmd" a.yaml',
    ],
    [
      "node_modules/.bin/openapi-typescript.cmd a.yaml",
      "node_modules/.bin/openapi-typesafe.cmd a.yaml",
    ],
  ])(
    "migrateCommand renames the generator bin with a Windows suffix in %s",
    (command, expected) => {
      expect(migrateCommand(command, "scripts.gen").text).toBe(expected);
    },
  );

  it.each([
    [
      "node_modules\\.bin\\openapi-typescript a.yaml -it",
      "node_modules\\.bin\\openapi-typesafe a.yaml --immutable",
    ],
    [
      '"node_modules\\.bin\\openapi-typescript" a.yaml',
      '"node_modules\\.bin\\openapi-typesafe" a.yaml',
    ],
    ["\\openapi-typescript a.yaml -it", "\\openapi-typesafe a.yaml --immutable"],
  ])(
    "migrateCommand renames the generator bin given by a Windows path in %s",
    (command, expected) => {
      expect(migrateCommand(command, "scripts.gen").text).toBe(expected);
    },
  );

  it("migrateCommand reports a file of the old package given by a Windows path without a suffix", () => {
    const migrated = migrateCommand(
      "node node_modules\\openapi-typescript\\bin\\cli.js a.yaml",
      "scripts.gen",
    );

    expect(migrated.manualSteps).toEqual([
      {
        kind: "old-package-file",
        location: "scripts.gen",
        path: "node_modules/openapi-typescript/bin/cli.js",
      },
    ]);
  });

  it.each([
    ["C:\\tools\\openapi-typescript a.yaml -it", "C:\\tools\\openapi-typescript"],
    ['"C:\\tools\\openapi-typescript.cmd" a.yaml', "C:\\tools\\openapi-typescript.cmd"],
    ["/usr/local/bin/openapi-typescript a.yaml -it", "/usr/local/bin/openapi-typescript"],
  ])("migrateCommand reports a generator installed outside the project in %s", (command, word) => {
    const migrated = migrateCommand(command, "scripts.gen");

    expect(migrated.text).toBe(command);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "scripts.gen", word },
    ]);
  });

  it("migrateCommand keeps a path to another program silently", () => {
    const command = "C:\\tools\\openapi-typescript-x a.yaml && /usr/bin/node gen.js";

    expect(migrateCommand(command, "scripts.gen")).toEqual({
      text: command,
      changes: [],
      manualSteps: [],
    });
  });

  it("migrateCommand keeps a program that only starts with the generator name", () => {
    const command = "openapi-typescript.cmdx a.yaml -it && openapi-typescript-x.cmd b.yaml -it";

    expect(migrateCommand(command, "scripts.gen").text).toBe(command);
  });

  it("migrateCommand reports a file of the old package given by a Windows path", () => {
    const migrated = migrateCommand(
      "node node_modules\\openapi-typescript\\bin\\cli.cmd a.yaml",
      "scripts.gen",
    );

    expect(migrated.manualSteps).toEqual([
      {
        kind: "old-package-file",
        location: "scripts.gen",
        path: "node_modules/openapi-typescript/bin/cli.cmd",
      },
    ]);
  });

  it("migrateCommandLines renames the flags after a variable set to the bin with a suffix", () => {
    const text = 'GEN="openapi-typescript.cmd"\n$GEN a.yaml -it\n';

    expect(migrateCommandLines(text, "gen.sh").text).toBe(
      'GEN="openapi-typesafe.cmd"\n$GEN a.yaml --immutable\n',
    );
  });
});
