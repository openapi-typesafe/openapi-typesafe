import { describe, expect, it } from "vitest";
import {
  importedSpecifiers,
  migrateModuleSpecifiers,
  type SourceString,
} from "../../src/domain/source-migration.js";

/** The quoted string `value` where it first appears in `text`, as a scanner reports it. */
function stringIn(text: string, value: string, isModuleSpecifier = true): SourceString {
  const start =
    [`"${value}"`, `'${value}'`, `\`${value}\``]
      .map((quoted) => text.indexOf(quoted))
      .filter((index) => index !== -1)
      .reduce((first, index) => Math.min(first, index), text.length) + 1;
  return { start, end: start + value.length, value, isModuleSpecifier };
}

const VERSION = "1.0.0";

/** The text `${name}` of a template substitution, as a source file holds it. */
const substitution = (name: string): string => ["$", "{", name, "}"].join("");

describe("migrateModuleSpecifiers", () => {
  it("migrateModuleSpecifiers renames module specifiers that are package names", () => {
    const text = [
      'import createClient from "openapi-fetch";',
      "import type { paths } from 'openapi-typescript-helpers';",
      "const api = await import(`openapi-typescript`);",
    ].join("\n");
    // Out of order on purpose: the scanner's order is not part of the contract.
    const strings = [
      stringIn(text, "openapi-typescript"),
      stringIn(text, "openapi-fetch"),
      stringIn(text, "openapi-typescript-helpers"),
    ];

    const migrated = migrateModuleSpecifiers(text, strings, VERSION);

    expect(migrated.text).toBe(
      [
        'import createClient from "openapi-typesafe-fetch";',
        "import type { paths } from 'openapi-typesafe-helpers';",
        "const api = await import(`openapi-typesafe`);",
      ].join("\n"),
    );
    expect(
      migrated.changes.map((change) => change.kind === "specifier-renamed" && change.line),
    ).toEqual([1, 2, 3]);
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateModuleSpecifiers renames a deep import and reports it", () => {
    const text = 'import x from "openapi-fetch/dist/index.js";';

    const migrated = migrateModuleSpecifiers(
      text,
      [stringIn(text, "openapi-fetch/dist/index.js")],
      VERSION,
    );

    expect(migrated.text).toBe('import x from "openapi-typesafe-fetch/dist/index.js";');
    expect(migrated.manualSteps).toEqual([
      { kind: "deep-import", line: 1, specifier: "openapi-typesafe-fetch/dist/index.js" },
    ]);
  });

  it("migrateModuleSpecifiers keeps the bundler query of a renamed specifier", () => {
    const text = [
      'import u from "openapi-fetch?url";',
      'import r from "openapi-fetch/x.js?raw";',
    ].join("\n");
    const strings = [stringIn(text, "openapi-fetch?url"), stringIn(text, "openapi-fetch/x.js?raw")];

    const migrated = migrateModuleSpecifiers(text, strings, VERSION);

    expect(migrated.text).toBe(text.replaceAll("openapi-fetch", "openapi-typesafe-fetch"));
    expect(migrated.manualSteps).toEqual([
      { kind: "deep-import", line: 2, specifier: "openapi-typesafe-fetch/x.js?raw" },
    ]);
  });

  it("migrateModuleSpecifiers reports an import from the node_modules of an old package", () => {
    const text = [
      'import k from "../node_modules/openapi-fetch/dist/index.js";',
      'const label = "node_modules/openapi-fetch/x.js";',
      'import l from "../node_modules/left-pad/x.js";',
      'import h from "./node_modules/openapi-typescript-helpers/x.js";',
    ].join("\n");
    const strings = [
      stringIn(text, "../node_modules/openapi-fetch/dist/index.js"),
      stringIn(text, "node_modules/openapi-fetch/x.js", false),
      stringIn(text, "../node_modules/left-pad/x.js"),
      stringIn(text, "./node_modules/openapi-typescript-helpers/x.js"),
    ];

    const migrated = migrateModuleSpecifiers(text, strings, VERSION);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "old-package-import",
        line: 1,
        specifier: "../node_modules/openapi-fetch/dist/index.js",
        name: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
      {
        kind: "old-package-import",
        line: 4,
        specifier: "./node_modules/openapi-typescript-helpers/x.js",
        name: "openapi-typescript-helpers",
        to: "openapi-typesafe-helpers",
      },
    ]);
  });

  it("migrateModuleSpecifiers reports a package name outside a module specifier and keeps it", () => {
    const text = 'const versions = {\n  "openapi-typescript": "7.13.0",\n};';

    const migrated = migrateModuleSpecifiers(
      text,
      [stringIn(text, "openapi-typescript", false)],
      VERSION,
    );

    expect(migrated).toEqual({
      text,
      changes: [],
      manualSteps: [
        {
          kind: "string-names-package",
          line: 2,
          value: "openapi-typescript",
          to: "openapi-typesafe",
        },
      ],
    });
  });

  it("migrateModuleSpecifiers leaves strings that are not package names", () => {
    const text = 'import a from "openapi-fetch-gen";\nimport b from "@scope/openapi-fetch";';
    const strings = [stringIn(text, "openapi-fetch-gen"), stringIn(text, "@scope/openapi-fetch")];

    expect(migrateModuleSpecifiers(text, strings, VERSION)).toEqual({
      text,
      changes: [],
      manualSteps: [],
    });
  });

  it("migrateModuleSpecifiers renames a string found twice once", () => {
    const text = 'import x from "openapi-fetch";';
    const found = stringIn(text, "openapi-fetch");

    const migrated = migrateModuleSpecifiers(
      text,
      [found, { ...found, isModuleSpecifier: false }],
      VERSION,
    );

    expect(migrated).toEqual({
      text: 'import x from "openapi-typesafe-fetch";',
      changes: [
        { kind: "specifier-renamed", line: 1, from: "openapi-fetch", to: "openapi-typesafe-fetch" },
      ],
      manualSteps: [],
    });
  });

  it("migrateModuleSpecifiers rejects strings that cross", () => {
    const text = 'import x from "openapi-fetch/client";';
    const whole = stringIn(text, "openapi-fetch/client");
    const crossing = { ...whole, start: whole.start + 1, end: whole.end + 1 };

    expect(() => migrateModuleSpecifiers(text, [whole, crossing], VERSION)).toThrow(/overlap/);
  });

  it("migrateModuleSpecifiers renames a string inside a template that is not renamed", () => {
    const value = substitution('await import("openapi-fetch")');
    const text = `const a = \`${value}\`;`;
    const template = stringIn(text, value, false);
    const inner = stringIn(text, "openapi-fetch");

    const migrated = migrateModuleSpecifiers(text, [inner, template], VERSION);

    const renamed = substitution('await import("openapi-typesafe-fetch")');
    expect(migrated.text).toBe(`const a = \`${renamed}\`;`);
  });

  it("migrateModuleSpecifiers reports a specifier inside a template it renames", () => {
    const name = substitution('"openapi-fetch"');
    const text = `import(\`openapi-fetch/${name}\`);`;
    const template = stringIn(text, `openapi-fetch/${name}`);
    const inner = stringIn(text, "openapi-fetch");

    const migrated = migrateModuleSpecifiers(text, [template, inner], VERSION);

    expect(migrated.text).toBe(`import(\`openapi-typesafe-fetch/${name}\`);`);
    expect(migrated.manualSteps).toContainEqual({
      kind: "string-names-package",
      line: 1,
      value: "openapi-fetch",
      to: "openapi-typesafe-fetch",
    });
  });

  it("migrateModuleSpecifiers renames a Deno npm specifier with the new version", () => {
    const text = 'import a from "npm:openapi-fetch@^0.13.0";\nimport b from "npm:openapi-fetch";\n';
    const strings = [
      stringIn(text, "npm:openapi-fetch@^0.13.0"),
      stringIn(text, "npm:openapi-fetch"),
    ];

    const migrated = migrateModuleSpecifiers(text, strings, VERSION);

    expect(migrated.text).toBe(
      'import a from "npm:openapi-typesafe-fetch@^1.0.0";\nimport b from "npm:openapi-typesafe-fetch";\n',
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateModuleSpecifiers reports a Deno npm specifier that reaches in or keeps a tag", () => {
    const text = 'import a from "npm:openapi-fetch@next/dist/x.js";\n';

    const migrated = migrateModuleSpecifiers(
      text,
      [stringIn(text, "npm:openapi-fetch@next/dist/x.js")],
      VERSION,
    );

    const to = "npm:openapi-typesafe-fetch@next/dist/x.js";
    expect(migrated.text).toBe(`import a from "${to}";\n`);
    expect(migrated.manualSteps).toEqual([
      { kind: "deep-import", line: 1, specifier: to },
      { kind: "spec-kept", name: to, spec: "npm:openapi-fetch@next/dist/x.js" },
    ]);
  });
});

describe("migrateModuleSpecifiers and run-time names", () => {
  it("migrateModuleSpecifiers reports a template that adds to an old package name", () => {
    const value = `openapi-typescript-helpers\${suffix}`;
    const text = `const h = import(\`${value}\`);\nconst o = \`openapi-fetch\${x}\`;\n`;
    const strings = [stringIn(text, value), stringIn(text, `openapi-fetch\${x}`, false)];

    const migration = migrateModuleSpecifiers(text, strings, "1.0.0");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toEqual([
      { kind: "dynamic-specifier", line: 1, value, to: "openapi-typesafe-helpers" },
    ]);
  });

  it("migrateModuleSpecifiers leaves a template of another package alone", () => {
    const value = `openapi-fetch-extra\${x}`;
    const text = `import(\`${value}\`);\n`;

    const migration = migrateModuleSpecifiers(text, [stringIn(text, value)], "1.0.0");

    expect(migration.manualSteps).toEqual([]);
  });
});

describe("importedSpecifiers", () => {
  it("importedSpecifiers gives the module specifiers with new names and their lines", () => {
    const text =
      'import "openapi-fetch/x";\nconst label = "openapi-typesafe-helpers";\nimport "zod";\n';
    const strings = [
      stringIn(text, "openapi-fetch/x"),
      stringIn(text, "openapi-typesafe-helpers", false),
      stringIn(text, "zod"),
    ];

    expect(importedSpecifiers(text, strings)).toEqual([
      { specifier: "openapi-typesafe-fetch/x", line: 1 },
      { specifier: "zod", line: 3 },
    ]);
  });
});
