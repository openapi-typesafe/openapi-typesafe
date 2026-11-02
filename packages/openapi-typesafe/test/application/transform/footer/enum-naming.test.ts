import { describe, expect, it } from "vitest";
import {
  EmptyEnumNameError,
  EnumNaming,
  enumDeclaration,
} from "../../../../src/application/transform/footer/enum-naming.js";

describe("EnumNaming", () => {
  it("enumName joins words and capitalizes the first character", () => {
    expect(new EnumNaming().enumName("/pet/my status")).toBe("PetMyStatus");
  });

  it.each([
    ["0 a-b", "value0AB"],
    ["\u{1D1B9}9 x", "value9X"],
    ["§9abc", "value9abc"],
    ["9abc", "value9abc"],
  ])("arrayName(%j) is the identifier %s", (name, expected) => {
    expect(new EnumNaming().arrayName(name)).toBe(expected);
  });

  it("enumName prefixes a name that starts with a digit after sanitizing it (legacy bug 15)", () => {
    expect(new EnumNaming().enumName("1a-b")).toBe("Value1aB");
  });

  it("enumName keeps a trailing invalid character after one was removed (original state)", () => {
    const naming = new EnumNaming();

    const names = ["a-", "b-", "c-"].map((name) => naming.enumName(name));

    expect(names).toEqual(["A", "B-", "C"]);
  });

  it("memberName resets the state when it rewrites a name", () => {
    const naming = new EnumNaming();

    naming.enumName("a-");
    naming.memberName("x y");

    expect(naming.enumName("b-")).toBe("B");
  });

  it("enumName without valid characters fails with EmptyEnumNameError", () => {
    expect(() => new EnumNaming().enumName("-")).toThrow(EmptyEnumNameError);
  });

  it("arrayName lowercases the first character", () => {
    expect(new EnumNaming().arrayName("PetStatusValues")).toBe("petStatusValues");
  });

  it("memberName rewrites numbers, negatives, special and invalid characters", () => {
    const naming = new EnumNaming();

    const names = [1.5, -2, "a+", "a b", "é", "ok"].map((value) => naming.memberName(value));

    expect(names).toEqual(["Value1_5", "ValueMinus2", "aPlus", "a_b", '"é"', "ok"]);
  });

  it("memberName prefers the metadata name", () => {
    expect(new EnumNaming().memberName("a", { name: "Named" })).toBe("Named");
  });
});

describe("enumDeclaration", () => {
  it("enumDeclaration exports the enum and comments members with a description", () => {
    const members = { values: ["a", 1], metadata: [{ description: "  First  " }, undefined] };

    const declaration = enumDeclaration("E", members, new EnumNaming());

    expect(declaration).toEqual({
      kind: "enum",
      name: "E",
      isExported: true,
      members: [
        { name: "a", value: "a", comments: [{ kind: "line", text: " First" }] },
        { name: "Value1", value: 1, comments: [] },
      ],
      comments: [],
    });
  });
});

// Upstream #2807, #2812: an empty string value gave an empty member name.
// Upstream #2614: a quoted member name was not escaped, so `\` gave `"\"`.
describe("EnumNaming.memberName for names that must be quoted", () => {
  it.each([
    ["", '""'],
    ["\\", '"\\\\"'],
    ['"', '"\\""'],
  ])("memberName(%j) is %s", (value, name) => {
    expect(new EnumNaming().memberName(value)).toBe(name);
  });
});

// Upstream #2838: a line break in `x-enum-descriptions` ended the `//` comment early.
describe("enumDeclaration member comments with line breaks", () => {
  it.each([
    ["Code 100\nspanning two lines", " Code 100 spanning two lines"],
    ["a\r\nb\rc d e", " a b c d e"],
  ])("the comment of %j is one line", (description, text) => {
    const declaration = enumDeclaration(
      "Codes",
      { values: [100], metadata: [{ description }] },
      new EnumNaming(),
    );

    expect(declaration.members[0]?.comments).toEqual([{ kind: "line", text }]);
  });
});
