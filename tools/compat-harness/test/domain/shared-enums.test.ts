import { describe, expect, it } from "vitest";
import { isSharedEnumSplit } from "../../src/domain/shared-enums.ts";

const NUMBERS = ["export enum $Version {", "    Value1 = 1,", "    Value2 = 2", "}"];
const STRINGS = ["export enum $Peer {", '    Value1 = "1",', '    Value2 = "2"', "}"];
const GOLDEN = ["type Peer = {", "    ikeVersion?: $Version;", "};", ...NUMBERS].join("\n");
const SPLIT = ["type Peer = {", "    ikeVersion?: $Peer;", "};", ...NUMBERS, ...STRINGS].join("\n");

describe("isSharedEnumSplit", () => {
  it("isSharedEnumSplit with a reference moved to an added enum of other values returns true", () => {
    expect(isSharedEnumSplit(GOLDEN, SPLIT)).toBe(true);
  });

  it("isSharedEnumSplit without an added enum or a moved reference returns false", () => {
    expect(isSharedEnumSplit(GOLDEN, GOLDEN)).toBe(false);
    expect(isSharedEnumSplit(GOLDEN, `${GOLDEN}\n${STRINGS.join("\n")}`)).toBe(false);
  });

  it("isSharedEnumSplit with an added enum of the same values returns false", () => {
    const renamed = SPLIT.replace('"1"', "1").replace('"2"', "2");

    expect(isSharedEnumSplit(GOLDEN, renamed)).toBe(false);
  });

  it("isSharedEnumSplit with another changed line returns false", () => {
    expect(isSharedEnumSplit(GOLDEN, SPLIT.replace("type Peer", "type Pair"))).toBe(false);
    expect(isSharedEnumSplit(GOLDEN, SPLIT.replace("ikeVersion?", "version?"))).toBe(false);
    expect(isSharedEnumSplit(GOLDEN, `${SPLIT}\n// extra`)).toBe(false);
  });

  it("isSharedEnumSplit matches only whole enum names", () => {
    const longer = GOLDEN.replace("?: $Version;", "?: $VersionOld;");
    const both = (type: string) => GOLDEN.replace("?: $Version;", `?: $VersionOld | ${type};`);
    const split = (type: string) => SPLIT.replace("?: $Peer;", `?: $VersionOld | ${type};`);

    expect(isSharedEnumSplit(longer, SPLIT)).toBe(false);
    expect(isSharedEnumSplit(both("$Version"), split("$Peer"))).toBe(true);
    expect(isSharedEnumSplit(both("Old$Version"), split("Old$Peer"))).toBe(false);
  });
});
