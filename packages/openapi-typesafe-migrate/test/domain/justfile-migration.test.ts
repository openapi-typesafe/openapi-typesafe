import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { migrateJustfile } from "../../src/domain/justfile-migration.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const context = {
  version: "1.0.0",
  catalogs: NO_CATALOG_PLAN,
  manifests: [],
  aliases: [],
  apiDescriptionParts: new Set<string>(),
  rewriter: new StubCallbackRewriter(),
  scanner: new QuotedStringScanner(),
  readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
};

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("migrateJustfile", () => {
  it("migrateJustfile migrates a variable set to the generator and the flags of its uses", () => {
    const text = lines(
      `gen := "npx openapi-typescript"`,
      "export run := gen",
      "",
      "gen:",
      "    {{gen}} a.yaml -it",
      "    @{{ run }} b.yaml -it",
      "    openapi-typescript c.yaml -it",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(
      lines(
        `gen := "npx openapi-typesafe"`,
        "export run := gen",
        "",
        "gen:",
        "    {{gen}} a.yaml --immutable",
        "    @{{ run }} b.yaml --immutable",
        "    openapi-typesafe c.yaml --immutable",
      ),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateJustfile reads values before a comment and with escaped quotes", () => {
    const text = lines(
      `gen := "openapi-typescript -o \\"a b.ts\\" -it" # the generator`,
      "run := gen # an alias",
      "gen:",
      "    {{run}} a.yaml -it",
    );

    expect(migrateJustfile(text, "justfile").text).toBe(
      lines(
        `gen := "openapi-typesafe -o \\"a b.ts\\" --immutable" # the generator`,
        "run := gen # an alias",
        "gen:",
        "    {{run}} a.yaml --immutable",
      ),
    );
  });

  it("migrateJustfile reports old flags in a variable that the generator gets", () => {
    const text = lines("flags := '-it'", "gen:", "    openapi-typescript a.yaml {{flags}}");

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([
      { kind: "flags-in-variable", location: "justfile:3", variable: "{{flags}}", flags: ["-it"] },
    ]);
  });

  it("migrateJustfile leaves the flags after a variable whose value just computes", () => {
    const text = lines(`gen := openapi-typescript + " x"`, "gen:", "    {{gen}} a.yaml -it");

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([]);
  });

  it.each([
    [
      `env_var_or_default("GEN", "npx openapi-typescript")`,
      `env_var_or_default("GEN", "npx openapi-typesafe")`,
    ],
    [
      `if os() == "windows" { "npx -y openapi-typescript" } else { 'npx openapi-typescript' }`,
      `if os() == "windows" { "npx -y openapi-typesafe" } else { 'npx openapi-typesafe' }`,
    ],
  ])(
    "migrateJustfile migrates the strings of a computed value %s and reports its flags",
    (value, expected) => {
      const text = lines(`gen := ${value} # the generator`, "gen:", "    {{gen}} a.yaml -it");

      const migrated = migrateJustfile(text, "justfile");

      expect(migrated.text).toBe(
        lines(`gen := ${expected} # the generator`, "gen:", "    {{gen}} a.yaml -it"),
      );
      expect(migrated.manualSteps).toEqual([
        {
          kind: "variable-not-only-generator",
          location: `justfile:${text.split("\n").length - 1}`,
          variable: "{{gen}}",
          flags: ["-it"],
        },
      ]);
    },
  );

  it("migrateJustfile reads an indented string over lines as one string value", () => {
    const text = lines(
      'gen := """',
      "  npx openapi-typescript",
      '"""',
      "gen:",
      "    {{gen}} a.yaml -it",
    );

    expect(migrateJustfile(text, "justfile").text).toBe(
      lines(
        'gen := """',
        "  npx openapi-typesafe",
        '"""',
        "gen:",
        "    {{gen}} a.yaml --immutable",
      ),
    );
  });

  it("migrateJustfile migrates a backtick of a value as a command that just runs", () => {
    const text = lines(
      "version := `npx openapi-typescript --version`",
      "v:",
      "    echo {{version}}",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain("version := `npx openapi-typesafe --version`");
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateJustfile reports old flags in a parameter default that the generator gets", () => {
    const text = lines(
      "b gen='npx openapi-typescript' *flags='-it' out=(\"-\" + 'x' + '--redoc') empty=gen:",
      "    {{gen}} f.yaml {{flags}}",
      "    openapi-typescript g.yaml {{out}} {{empty}}",
    );

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "justfile:2",
        variable: "{{gen}}",
        flags: ["-it"],
      },
      {
        kind: "flags-in-variable",
        location: "justfile:3",
        variable: "{{out}}",
        flags: ["--redoc"],
      },
    ]);
  });

  it("migrateJustfile leaves a recipe that another program runs and reports its old names", () => {
    const text = lines(
      "py:",
      "",
      "    #!/usr/bin/env python3",
      "    import subprocess",
      "",
      '    subprocess.run(["npx", "openapi-typescript", "{{x}}", "-it"])',
      "after:",
      "    npx openapi-typescript a.yaml -it",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(
      text
        .replace("a.yaml -it", "a.yaml --immutable")
        .replace("npx openapi-typescript a.yaml", "npx openapi-typesafe a.yaml"),
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "justfile:3", shell: "/usr/bin/env python3" },
    ]);
  });

  it.each([
    ["a shell shebang", "    #!/usr/bin/env bash", "    npx openapi-typescript a.yaml -it"],
    ["no shebang", "    # !python", "    npx openapi-typescript a.yaml -it"],
    ["a shebang after the first line", "    npx openapi-typescript a.yaml -it", "    #!python"],
  ])("migrateJustfile reads a recipe with %s as shell text", (_, first, second) => {
    const text = lines("a:", first, second);

    expect(migrateJustfile(text, "justfile").text).toContain("openapi-typesafe a.yaml --immutable");
  });

  it("migrateJustfile reads a recipe with Windows line ends up to the next recipe", () => {
    const text =
      "py:\r\n    #!python\r\n    print('openapi-fetch')\r\nb:\r\n    openapi-typescript a.yaml\r\n";

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain("    openapi-typesafe a.yaml\r\n");
    expect(migrated.manualSteps).toEqual([
      { kind: "script-not-shell", location: "justfile:2", shell: "python" },
    ]);
  });

  it("migrateJustfile reports nothing for a recipe of another program without old names", () => {
    const text = lines("a:", "    #!/usr/bin/env node", "    console.log(1)");

    expect(migrateJustfile(text, "justfile")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateJustfile migrates a recipe parameter default and reports the flags after it", () => {
    const text = lines(
      'types out *args gen="npx openapi-typescript" +rest=(gen + "x"): build',
      "    {{gen}} api.yaml -it",
      "build:",
      "    echo built",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "justfile:2",
        variable: "{{gen}}",
        flags: ["-it"],
      },
    ]);
  });

  it("migrateJustfile reads a parameter default that names a variable", () => {
    const text = lines(
      `base := "openapi-typescript"`,
      "types gen=base:",
      "    {{gen}} api.yaml -it",
    );

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "justfile:3",
        variable: "{{gen}}",
        flags: ["-it"],
      },
    ]);
  });

  it("migrateJustfile reads the output of a backtick as another program", () => {
    const text = lines("gen := `npx openapi-typescript --help`", "gen:", "    {{gen}} a.yaml -it");

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateJustfile reads a string with more after it as a computed value", () => {
    const text = lines(`gen := "openapi-typescript" + suffix`, "gen:", "    {{gen}} a.yaml -it");

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain("{{gen}} a.yaml -it");
    expect(migrated.manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", flags: ["-it"] }),
    ]);
  });

  it("migrateJustfile reads a parameter default in parentheses as one word", () => {
    const text = lines('types gen=("npx" + " openapi-typescript"):', "    {{gen}} a.yaml");

    expect(migrateJustfile(text, "justfile").text).toContain(
      'types gen=("npx" + " openapi-typesafe"):',
    );
  });

  it("migrateJustfile reads a recipe header as just reads it, not as a command", () => {
    const text = lines("types gen=openapi-typescript:", "    echo {{gen}}");

    expect(migrateJustfile(text, "justfile")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateJustfile reads a }} inside a string as part of the interpolation", () => {
    const text = lines("gen:", "    echo {{ '}}' + \"npx openapi-typescript\" }}");

    expect(migrateJustfile(text, "justfile").text).toContain('"npx openapi-typesafe" }}');
  });

  it("migrateJustfile reports the flags after a word that joins an interpolation to more text", () => {
    const text = lines("gen:", "    {{ 'openapi-typescript' }}-cli a.yaml -it");

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", flags: ["-it"] }),
    ]);
  });

  it("migrateJustfile reads no header in a set or an alias line", () => {
    const text = lines(`set shell := ["bash", "-c"]`, "alias t := types", "types:", "    echo ok");

    expect(migrateJustfile(text, "justfile")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateJustfile migrates the strings of an interpolation and reports the flags after it", () => {
    const text = lines(
      "gen:",
      '    {{ env_var_or_default("GEN", "npx openapi-typescript") }} a.yaml -it',
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain('"npx openapi-typesafe") }} a.yaml -it');
    expect(migrated.manualSteps).toEqual([
      expect.objectContaining({
        kind: "variable-not-only-generator",
        location: "justfile:2",
        flags: ["-it"],
      }),
    ]);
  });

  it("migrateJustfile leaves the flags after an expression that is not one variable", () => {
    const text = lines(`gen := "openapi-typescript"`, "gen:", "    {{gen + 'x'}} a.yaml -it");

    expect(migrateJustfile(text, "justfile").text).toBe(
      lines(`gen := "openapi-typesafe"`, "gen:", "    {{gen + 'x'}} a.yaml -it"),
    );
  });
});

describe("fileMigrationFor and justfiles", () => {
  it("fileMigrationFor migrates each justfile name with the justfile migration", () => {
    const text = lines(`gen := "openapi-typescript"`, "gen:", "    {{gen}} a.yaml -it");
    const expected = lines(`gen := "openapi-typesafe"`, "gen:", "    {{gen}} a.yaml --immutable");

    for (const name of ["justfile", "Justfile", "tools/.justfile"]) {
      const migrate = fileMigrationFor(name);

      expect(migrate?.(text, name, context).text).toBe(expected);
    }
  });
});
