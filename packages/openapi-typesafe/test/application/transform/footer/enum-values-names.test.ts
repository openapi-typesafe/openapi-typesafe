import { describe, expect, it } from "vitest";
import { EnumValuesNames } from "../../../../src/application/transform/footer/enum-values-names.js";

describe("EnumValuesNames", () => {
  it("nameFor gives the first array its name and a later array the next number", () => {
    const names = new EnumValuesNames();

    const first = names.nameFor("a", "typeValues", undefined);
    const second = names.nameFor("b", "typeValues", undefined);
    const third = names.nameFor("c", "typeValues", undefined);

    expect([first, second, third]).toEqual([
      { name: "typeValues", isNew: true },
      { name: "typeValues_2", isNew: true },
      { name: "typeValues_3", isNew: true },
    ]);
  });

  it("nameFor gives a repeated array its first name and marks it as declared", () => {
    const names = new EnumValuesNames();
    names.nameFor("a", "typeValues", undefined);
    names.nameFor("b", "typeValues", undefined);

    expect(names.nameFor("b", "typeValues", undefined)).toEqual({
      name: "typeValues_2",
      isNew: false,
    });
  });

  it("finalNames keeps the names of arrays that are no tuple elements", () => {
    const names = new EnumValuesNames();
    names.nameFor("b", "typeValues", undefined);
    names.nameFor("a", "typeValues", undefined);

    expect(names.finalNames()).toEqual(new Map());
  });

  it("finalNames numbers tuple elements by position when a later one came first", () => {
    const names = new EnumValuesNames();
    names.nameFor("second", "tupValues", 1);
    names.nameFor("first", "tupValues", 0);
    names.nameFor("other", "otherValues", undefined);

    expect(names.finalNames()).toEqual(
      new Map([
        ["tupValues", "tupValues_2"],
        ["tupValues_2", "tupValues"],
      ]),
    );
  });

  it("finalNames ranks a repeated tuple element by its lowest position", () => {
    const names = new EnumValuesNames();
    names.nameFor("same", "tupValues", 2);
    names.nameFor("other", "tupValues", 1);
    names.nameFor("same", "tupValues", 0);

    expect(names.finalNames()).toEqual(new Map());
  });

  it("finalNames gives a third tuple element the number after the second", () => {
    const names = new EnumValuesNames();
    names.nameFor("third", "tupValues", 2);
    names.nameFor("first", "tupValues", 0);
    names.nameFor("second", "tupValues", 1);

    expect(names.finalNames()).toEqual(
      new Map([
        ["tupValues", "tupValues_3"],
        ["tupValues_2", "tupValues"],
        ["tupValues_3", "tupValues_2"],
      ]),
    );
  });
});
