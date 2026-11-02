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

  it("enumName prefixes a name that starts with a digit, unsanitized", () => {
    expect(new EnumNaming().enumName("1a-b")).toBe("Value1a-b");
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
