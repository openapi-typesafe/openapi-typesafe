import { describe, expect, it } from "vitest";
import { isIntersectedEnumUnified } from "../../src/domain/intersected-enums.ts";

// Excerpts of motaword.com and nexmo.com messages-olympus under `--enum`: an own enum next to a
// base enum, narrowed to a member, and a nested own enum replaced by the whole base enum.
const BODY = [
  "export interface components {",
  "    schemas: {",
  "        Base: {",
  "            status?: BaseStatus;",
  "            usage?: {",
  "                currency?: BaseCurrency;",
  "            };",
  "        };",
  '        Done: components["schemas"]["Base"] & {',
  "            /**",
  "             * @default success",
  "             * @enum {string}",
  "             */",
  "            status: DoneStatus;",
  "            usage?: {",
  "                currency?: DoneCurrency;",
  "            };",
  "        };",
  "    };",
  "}",
];
const DONE_STATUS = [
  "export enum DoneStatus {",
  '    already = "already",',
  '    error = "error",',
  '    success = "success"',
  "}",
];
const DONE_CURRENCY = ["export enum DoneCurrency {", '    EUR = "EUR",', '    USD = "USD"', "}"];
const BASE_STATUS = [
  "export enum BaseStatus {",
  '    success = "success",',
  '    error = "error",',
  '    pending = "pending"',
  "}",
];
const BASE_CURRENCY = ["export enum BaseCurrency {", '    EUR = "EUR"', "}"];
const FOOTER = [...DONE_STATUS, ...DONE_CURRENCY, ...BASE_STATUS, ...BASE_CURRENCY];
const GOLDEN = [...BODY, ...FOOTER, ""].join("\n");

const unifiedBody = (status: string, currency = "BaseCurrency"): string[] =>
  BODY.map((line) =>
    line
      .replace("status: DoneStatus;", `status: ${status};`)
      .replace("currency?: DoneCurrency;", `currency?: ${currency};`),
  );
/** The unified candidate, the base enums moved first and the unused `DoneCurrency` dropped. */
const unified = (status = "BaseStatus.success", currency = "BaseCurrency"): string =>
  [...unifiedBody(status, currency), ...BASE_STATUS, ...BASE_CURRENCY, ...DONE_STATUS, ""].join(
    "\n",
  );
const UNIFIED = unified();

describe("isIntersectedEnumUnified", () => {
  it("isIntersectedEnumUnified with own enums unified with the base returns true", () => {
    expect(isIntersectedEnumUnified(GOLDEN, UNIFIED)).toBe(true);
  });

  it("isIntersectedEnumUnified with a union of base members of own values returns true", () => {
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.success | BaseStatus.error"))).toBe(
      true,
    );
  });

  it("isIntersectedEnumUnified with every declaration kept in place returns true", () => {
    const kept = [...unifiedBody("BaseStatus.success"), ...FOOTER].join("\n");

    expect(isIntersectedEnumUnified(GOLDEN, kept)).toBe(true);
  });

  it("isIntersectedEnumUnified with the second enum of a line unified returns true", () => {
    const golden = GOLDEN.replace(
      "currency?: DoneCurrency;",
      "currency?: DoneStatus | DoneCurrency;",
    );
    const candidate = UNIFIED.replace(
      "currency?: BaseCurrency;\n            };\n        };\n    };",
      "currency?: DoneStatus | BaseCurrency;\n            };\n        };\n    };",
    );

    expect(isIntersectedEnumUnified(golden, candidate)).toBe(true);
  });

  it("isIntersectedEnumUnified with the same text returns false", () => {
    expect(isIntersectedEnumUnified(GOLDEN, GOLDEN)).toBe(false);
  });

  it("isIntersectedEnumUnified with a value the own enum does not list returns false", () => {
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus"))).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.pending"))).toBe(false);
    expect(
      isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.success | BaseStatus.pending")),
    ).toBe(false);
  });

  it("isIntersectedEnumUnified with no other golden enum as the type returns false", () => {
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.missing"))).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, unified("Missing.success"))).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, unified("DoneStatus.success"))).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.success | BaseCurrency.EUR"))).toBe(
      false,
    );
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.success | null"))).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, unified('"success"'))).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.success | Missing.error"))).toBe(
      false,
    );
    expect(
      isIntersectedEnumUnified(GOLDEN, unified("BaseStatus.success", "BaseCurrency | null")),
    ).toBe(false);
  });

  it("isIntersectedEnumUnified with the text around the reference changed returns false", () => {
    const status = "status: BaseStatus.success;";

    expect(
      isIntersectedEnumUnified(GOLDEN, UNIFIED.replace(status, "stat_s: BaseStatus.success;")),
    ).toBe(false);
    expect(
      isIntersectedEnumUnified(GOLDEN, UNIFIED.replace(status, "status: BaseStatus.success,")),
    ).toBe(false);
  });

  it("isIntersectedEnumUnified with another changed line returns false", () => {
    expect(isIntersectedEnumUnified(GOLDEN, UNIFIED.replace("status: Base", "state: Base"))).toBe(
      false,
    );
    expect(isIntersectedEnumUnified(GOLDEN, UNIFIED.replace("success;", "success | null;"))).toBe(
      false,
    );
    expect(isIntersectedEnumUnified(GOLDEN, UNIFIED.replace("@default success", "@default"))).toBe(
      false,
    );
    expect(
      isIntersectedEnumUnified(GOLDEN, UNIFIED.replace("}\nexport enum", "};\nexport enum")),
    ).toBe(false);
  });

  it("isIntersectedEnumUnified with a reference outside an intersection returns false", () => {
    const apart = (text: string) => text.replace('["Base"] & {', '["Base"] | {');

    expect(isIntersectedEnumUnified(apart(GOLDEN), apart(UNIFIED))).toBe(false);
  });

  it("isIntersectedEnumUnified does not take an earlier intersection for an ancestor", () => {
    // `Other` follows `Done`, so both intersections above `other` are earlier siblings.
    const sibling = (text: string) =>
      text.replace(
        "        };\n    };\n}\n",
        [
          "        };",
          "        Other: {",
          '            nested: components["schemas"]["Base"] & {',
          "                kind?: string;",
          "            };",
          "            other: DoneStatus;",
          "        };",
          "    };",
          "}",
          "",
        ].join("\n"),
      );
    const golden = sibling(GOLDEN);

    expect(isIntersectedEnumUnified(golden, sibling(UNIFIED))).toBe(true);
    expect(
      isIntersectedEnumUnified(
        golden,
        sibling(UNIFIED).replace("other: DoneStatus", "other: BaseStatus.success"),
      ),
    ).toBe(false);
  });

  it("isIntersectedEnumUnified with a changed, added or repeated enum returns false", () => {
    const extra = ["export enum Extra {", '    a = "a"', "}"].join("\n");

    expect(
      isIntersectedEnumUnified(GOLDEN, UNIFIED.replace('pending = "pending"', 'pending = "wait"')),
    ).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, `${UNIFIED}${extra}\n`)).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, `${UNIFIED}\n${extra}\n`)).toBe(false);
    expect(isIntersectedEnumUnified(GOLDEN, `${UNIFIED}${DONE_STATUS.join("\n")}\n`)).toBe(false);
  });

  it("isIntersectedEnumUnified with a dropped enum still referenced returns false", () => {
    const money = ["        Money: {", "            currency?: DoneCurrency;", "        };"];
    const withMoney = (text: string) =>
      text.replace("        Done: components", [...money, "        Done: components"].join("\n"));
    const kept = withMoney(UNIFIED).replace(
      "export enum BaseStatus",
      `${DONE_CURRENCY.join("\n")}\nexport enum BaseStatus`,
    );

    expect(isIntersectedEnumUnified(withMoney(GOLDEN), kept)).toBe(true);
    expect(isIntersectedEnumUnified(withMoney(GOLDEN), withMoney(UNIFIED))).toBe(false);
  });

  it("isIntersectedEnumUnified with a dropped enum that was not unified returns false", () => {
    const unused = ["export enum Unused {", '    a = "a"', "}", ""].join("\n");

    expect(isIntersectedEnumUnified(`${GOLDEN}${unused}`, `${UNIFIED}${unused}`)).toBe(true);
    expect(isIntersectedEnumUnified(`${GOLDEN}${unused}`, UNIFIED)).toBe(false);
  });

  it("isIntersectedEnumUnified with the same other lines among the enums returns true", () => {
    const helper = "type WithRequired<T> = T;";
    const withHelper = (text: string) =>
      text.replace("export enum BaseCurrency {", `${helper}\nexport enum BaseCurrency {`);

    expect(isIntersectedEnumUnified(withHelper(GOLDEN), withHelper(UNIFIED))).toBe(true);
    expect(isIntersectedEnumUnified(withHelper(GOLDEN), UNIFIED)).toBe(false);
  });

  it("isIntersectedEnumUnified with other lines after the enums returns false", () => {
    expect(isIntersectedEnumUnified(GOLDEN, `${UNIFIED}// extra`)).toBe(false);
    expect(isIntersectedEnumUnified(`${GOLDEN}// extra`, UNIFIED)).toBe(false);
  });

  it("isIntersectedEnumUnified with a line added to the body returns false", () => {
    const added = UNIFIED.replace(
      "}\nexport enum BaseStatus",
      "}\n// added\nexport enum BaseStatus",
    );

    expect(isIntersectedEnumUnified(GOLDEN, added)).toBe(false);
  });

  it("isIntersectedEnumUnified matches only enum names in type positions", () => {
    const named = (text: string, type: string) =>
      text.replace(/status: (?:DoneStatus|BaseStatus\.success);/, `status: ${type};`);
    const isUnified = (golden: string, candidate: string) =>
      isIntersectedEnumUnified(named(GOLDEN, golden), named(UNIFIED, candidate));

    expect(isUnified("Space.DoneStatus", "Space.BaseStatus.success")).toBe(false);
    expect(isUnified('Schemas["DoneStatus"]', 'Schemas["BaseStatus.success"]')).toBe(false);
    expect(isUnified("Space.Kind | DoneStatus", "Space.Kind | BaseStatus.success")).toBe(true);
  });
});
