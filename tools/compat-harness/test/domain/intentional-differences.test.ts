import { describe, expect, it } from "vitest";
import {
  applyIntentionalDifferences,
  INTENTIONAL_DIFFERENCES,
  type IntentionalDifference,
} from "../../src/domain/intentional-differences.ts";
import {
  FIXED_READ_WRITE_TYPES,
  FORK_BASE_READ_WRITE_TYPES,
} from "../../src/domain/read-write-marker-texts.ts";

const UPPER: IntentionalDifference = {
  id: "upper",
  issues: ["owner/repo#1"],
  description: "lowercase a becomes A",
  golden: /^a$/gm,
  candidate: "A",
};

describe("applyIntentionalDifferences", () => {
  it("applyIntentionalDifferences rewrites the golden text and names the differences it applied", () => {
    expect(applyIntentionalDifferences("a\nb\na", [UPPER])).toEqual({
      text: "A\nb\nA",
      appliedIds: ["upper"],
    });
  });

  it("applyIntentionalDifferences leaves text without a match unchanged and applies nothing", () => {
    expect(applyIntentionalDifferences("b", [UPPER])).toEqual({ text: "b", appliedIds: [] });
  });

  it("applyIntentionalDifferences can apply the same catalog many times", () => {
    applyIntentionalDifferences("a", [UPPER]);

    expect(applyIntentionalDifferences("a", [UPPER]).appliedIds).toEqual(["upper"]);
  });
});

describe("INTENTIONAL_DIFFERENCES", () => {
  it("every entry has a unique id, an upstream issue and a global multiline pattern", () => {
    const ids = INTENTIONAL_DIFFERENCES.map((difference) => difference.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const difference of INTENTIONAL_DIFFERENCES) {
      expect(difference.issues.length).toBeGreaterThan(0);
      expect(difference.golden.flags).toContain("g");
      expect(difference.golden.flags).toContain("m");
    }
  });

  it("an enum name that starts with a digit gets the Value prefix where a type name stands", () => {
    const golden = [
      "export enum 500ErrorCode {",
      "            code?: 500ErrorCode;",
      "            status: 401_UNAUTHORIZEDStatus[];",
      " * @description 3D models; 500 errors",
      '    value: "200OK";',
    ].join("\n");

    const { text, appliedIds } = applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES);

    expect(text.split("\n")).toEqual([
      "export enum Value500ErrorCode {",
      "            code?: Value500ErrorCode;",
      "            status: Value401_UNAUTHORIZEDStatus[];",
      " * @description 3D models; 500 errors",
      '    value: "200OK";',
    ]);
    expect(appliedIds).toEqual(["enum-name-leading-digit"]);
  });

  it("a kept-casing root type name gets _ for each character that cannot be in an identifier", () => {
    const golden = [
      "export type SchemaAddress-3 = components['schemas']['Address-3'];",
      "export type Schemaaaa.audit-logs = components['schemas']['aaa.audit-logs'];",
      "export type SchemaPet = components['schemas']['Pet'];",
      "export type Box<T> = { value: T };",
    ].join("\n");

    const { text, appliedIds } = applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES);

    expect(text.split("\n")).toEqual([
      "export type SchemaAddress_3 = components['schemas']['Address-3'];",
      "export type Schemaaaa_audit_logs = components['schemas']['aaa.audit-logs'];",
      "export type SchemaPet = components['schemas']['Pet'];",
      "export type Box<T> = { value: T };",
    ]);
    expect(appliedIds).toEqual(["root-type-name-identifier-characters"]);
  });

  it("a root type name without the prefix that starts with a digit gets the prefix back", () => {
    const golden = [
      "export type 400 = components['schemas']['400'];",
      "export type Pet = components['schemas']['Pet'];",
    ].join("\n");

    const { text, appliedIds } = applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES);

    expect(text.split("\n")).toEqual([
      "export type Schema400 = components['schemas']['400'];",
      "export type Pet = components['schemas']['Pet'];",
    ]);
    expect(appliedIds).toEqual(["root-type-name-leading-digit"]);
  });

  it("an index signature next to properties of other types gets their types", () => {
    const golden = [
      "        headers?: {",
      "            empty?: boolean;",
      "        } & {",
      "            [key: string]: string[];",
      "        };",
    ].join("\n");

    const { text, appliedIds } = applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES);

    expect(text.split("\n")[3]).toBe("            [key: string]: string[] | boolean;");
    expect(appliedIds).toEqual(["index-signature-property-types"]);
  });

  it("the empty enum member gets a quoted name", () => {
    const golden = 'export enum A {\n     = "",\n    b = "b"\n}\nexport enum B {\n     = ""\n}';

    expect(applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES).text).toBe(
      'export enum A {\n    "" = "",\n    b = "b"\n}\nexport enum B {\n    "" = ""\n}',
    );
  });

  it("the enum-values helpers get the fixed text", () => {
    const golden = [
      "type FlattenedDeepRequired<T> = {",
      "    [K in keyof T]-?: FlattenedDeepRequired<T[K] extends unknown[] | undefined | null " +
        "? Extract<T[K], unknown[]>[number] : T[K]>;",
      "};",
      "type ReadonlyArray<T> = [",
      "    Exclude<T, undefined>",
      "] extends [",
      "    unknown[]",
      "] ? Readonly<Exclude<T, undefined>> : Readonly<Exclude<T, undefined>[]>;",
    ].join("\n");

    const { text, appliedIds } = applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES);

    expect(text).toContain(
      "T[K] extends readonly unknown[] | undefined | null ? Extract<T[K], readonly unknown[]>" +
        "[number] : NonNullable<T[K]>>;",
    );
    expect(text).toContain("] extends [\n    readonly unknown[]\n]");
    expect(appliedIds).toEqual([
      "enum-values-flattened-deep-required",
      "enum-values-readonly-array",
    ]);
  });

  it("the catalog replaces the fork-base read-write helpers with the fixed text literally", () => {
    const golden = `export type $Read<T> = {\n    readonly $read: T;\n};\n${FORK_BASE_READ_WRITE_TYPES}\n`;

    const { text, appliedIds } = applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES);

    expect(text).toBe(
      `export type $Read<T> = {\n    readonly $read: T;\n};\n${FIXED_READ_WRITE_TYPES}\n`,
    );
    expect(appliedIds).toEqual(["read-write-marker-helpers"]);
  });
});
