import { describe, expect, it } from "vitest";
import { migrateModuleSpecifiers, type SourceString } from "../../src/domain/source-migration.js";

/** The quoted string `value` where it first appears in `text`, as a scanner reports it. */
function stringIn(text: string, value: string, isModuleSpecifier = true): SourceString {
  const quoted = new RegExp(`["'\`]${value.replaceAll("/", "\\/")}["'\`]`).exec(text);
  const start = (quoted?.index ?? -1) + 1;
  return { start, end: start + value.length, value, isModuleSpecifier };
}

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

    const migrated = migrateModuleSpecifiers(text, strings);

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

    const migrated = migrateModuleSpecifiers(text, [stringIn(text, "openapi-fetch/dist/index.js")]);

    expect(migrated.text).toBe('import x from "openapi-typesafe-fetch/dist/index.js";');
    expect(migrated.manualSteps).toEqual([
      { kind: "deep-import", line: 1, specifier: "openapi-typesafe-fetch/dist/index.js" },
    ]);
  });

  it("migrateModuleSpecifiers reports a package name outside a module specifier and keeps it", () => {
    const text = 'const versions = {\n  "openapi-typescript": "7.13.0",\n};';

    const migrated = migrateModuleSpecifiers(text, [stringIn(text, "openapi-typescript", false)]);

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

    expect(migrateModuleSpecifiers(text, strings)).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateModuleSpecifiers renames a string found twice once", () => {
    const text = 'import x from "openapi-fetch";';
    const found = stringIn(text, "openapi-fetch");

    const migrated = migrateModuleSpecifiers(text, [found, { ...found, isModuleSpecifier: false }]);

    expect(migrated).toEqual({
      text: 'import x from "openapi-typesafe-fetch";',
      changes: [
        { kind: "specifier-renamed", line: 1, from: "openapi-fetch", to: "openapi-typesafe-fetch" },
      ],
      manualSteps: [],
    });
  });

  it("migrateModuleSpecifiers rejects strings that overlap", () => {
    const text = 'import x from "openapi-fetch/client";';
    const whole = stringIn(text, "openapi-fetch/client");
    const value = "openapi-fetch";
    const part = {
      start: whole.start,
      end: whole.start + value.length,
      value,
      isModuleSpecifier: true,
    };

    expect(() => migrateModuleSpecifiers(text, [whole, part])).toThrow(/overlap/);
  });
});
