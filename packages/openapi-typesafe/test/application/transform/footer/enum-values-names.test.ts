import { describe, expect, it } from "vitest";
import { EnumValuesNames } from "../../../../src/application/transform/footer/enum-values-names.js";

const TUP = "#/components/schemas/Tup";
const OTHER = "#/components/schemas/Other";

describe("EnumValuesNames", () => {
  it("nameFor gives the first array its name and a later array the next number", () => {
    const names = new EnumValuesNames();

    const first = names.nameFor("a", "typeValues");
    const second = names.nameFor("b", "typeValues");
    const third = names.nameFor("c", "typeValues");

    expect([first, second, third]).toEqual([
      { name: "typeValues", isNew: true },
      { name: "typeValues_2", isNew: true },
      { name: "typeValues_3", isNew: true },
    ]);
  });

  it("nameFor gives a repeated array its first name and marks it as declared", () => {
    const names = new EnumValuesNames();
    names.nameFor("a", "typeValues");
    names.nameFor("b", "typeValues");

    expect(names.nameFor("b", "typeValues")).toEqual({
      name: "typeValues_2",
      isNew: false,
    });
  });

  it("finalNames keeps the names of arrays that are no tuple elements", () => {
    const names = new EnumValuesNames();
    names.nameFor("b", "typeValues");
    names.nameFor("a", "typeValues");

    expect(names.finalNames()).toEqual(new Map());
  });

  it("finalNames numbers tuple elements by position when a later one came first", () => {
    const names = new EnumValuesNames();
    // A `$ref` to the second element types it first; the walk then meets both in order.
    names.nameFor("second", "tupValues");
    names.nameFor("first", "tupValues", { walkedAt: TUP, position: 0 });
    names.nameFor("second", "tupValues", { walkedAt: TUP, position: 1 });
    names.nameFor("other", "otherValues", { walkedAt: OTHER });

    expect(names.finalNames()).toEqual(
      new Map([
        ["tupValues", "tupValues_2"],
        ["tupValues_2", "tupValues"],
      ]),
    );
  });

  it("finalNames ranks a repeated tuple element by its lowest position", () => {
    const names = new EnumValuesNames();
    names.nameFor("same", "tupValues", { walkedAt: TUP, position: 2 });
    names.nameFor("other", "tupValues", { walkedAt: TUP, position: 1 });
    names.nameFor("same", "tupValues", { walkedAt: TUP, position: 0 });

    expect(names.finalNames()).toEqual(new Map());
  });

  it("finalNames numbers the elements of two tuples of one name tuple by tuple", () => {
    const names = new EnumValuesNames();
    names.nameFor("up", "orderSortValues");
    names.nameFor("name", "orderSortValues", { walkedAt: TUP, position: 0 });
    names.nameFor("asc", "orderSortValues", { walkedAt: TUP, position: 1 });
    names.nameFor("id", "orderSortValues", { walkedAt: OTHER, position: 0 });
    names.nameFor("up", "orderSortValues", { walkedAt: OTHER, position: 1 });

    expect(names.finalNames()).toEqual(
      new Map([
        ["orderSortValues", "orderSortValues_4"],
        ["orderSortValues_2", "orderSortValues"],
        ["orderSortValues_3", "orderSortValues_2"],
        ["orderSortValues_4", "orderSortValues_3"],
      ]),
    );
  });
});
