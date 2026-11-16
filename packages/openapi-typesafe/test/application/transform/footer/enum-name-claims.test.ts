import { describe, expect, it } from "vitest";
import type { EnumGrouping } from "../../../../src/application/transform/footer/enum-groups.js";
import { EnumNameClaims } from "../../../../src/application/transform/footer/enum-name-claims.js";

const TUP = "#/components/schemas/Tup";

/** The enum of each owner given, and the names some enums ask for (`enumGrouping`). */
function grouping(enumOf: [string, string][], names: [string, string][] = []): EnumGrouping {
  return { enumOf: new Map(enumOf), names: new Map(names) };
}
const SORT = "#/components/schemas/Holder/properties/sort";

describe("EnumNameClaims", () => {
  it("nameFor gives the first owner its name and a later owner the next number", () => {
    const claims = new EnumNameClaims();

    const first = claims.nameFor("Status", "/status");
    const second = claims.nameFor("Status", "/Status");

    expect([first, second]).toEqual(["Status", "Status_2"]);
  });

  it("nameFor gives one owner the same name on every request", () => {
    const claims = new EnumNameClaims();

    claims.nameFor("PetKind", "/Pet/kind");
    claims.nameFor("PetKind", "/Pet-kind");

    expect(claims.nameFor("PetKind", "/Pet-kind")).toBe("PetKind_2");
    expect(claims.nameFor("PetKind", "/Pet/kind")).toBe("PetKind");
  });

  it("nameFor skips a number that an earlier enum took as its own name", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Status_2", "/Status_2");
    claims.nameFor("Status", "/status");

    expect(claims.nameFor("Status", "/Status")).toBe("Status_3");
  });

  it("nameFor skips a component enum name before the component claims it", () => {
    const claims = new EnumNameClaims(new Set(), new Set(["Pair_2"]));
    claims.nameFor("Pair", "/Pair/0");

    const element = claims.nameFor("Pair", "/Pair/1");

    expect([element, claims.nameFor("Pair_2", "/Pair_2")]).toEqual(["Pair_3", "Pair_2"]);
  });

  it("nameFor numbers a name the output may need", () => {
    const claims = new EnumNameClaims(new Set(["Blob"]));

    expect(claims.nameFor("Blob", "/Blob")).toBe("Blob_2");
  });

  it("finalNames gives back the stand-ins whose name the output does not need", () => {
    const claims = new EnumNameClaims(new Set(["Blob", "Record"]));
    claims.nameFor("Blob", "/Blob");
    claims.nameFor("Record", "/Record");

    const renames = claims.finalNames(new Set(["Record"]));

    expect([...renames]).toEqual([["Blob_2", "Blob"]]);
  });

  it("finalNames keeps the number of a later owner of a name", () => {
    const claims = new EnumNameClaims(new Set(["Blob"]));
    claims.nameFor("Blob", "/Blob");
    claims.nameFor("Blob", "/blob");

    expect([...claims.finalNames(new Set())]).toEqual([["Blob_2", "Blob"]]);
  });

  it("finalNames renames nothing where every number skipped the names asked for", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Status", "/status");
    claims.nameFor("Status", "/Status");
    claims.nameFor("Other", "/other");

    expect(claims.finalNames(new Set(["Status"])).size).toBe(0);
  });

  it("finalNames moves a number off the name a later location asks for", () => {
    const claims = new EnumNameClaims(new Set(), new Set(["HolderSort_3"]));
    const elements = [0, 1].map((position) =>
      claims.nameFor("HolderSort", `/Holder/sort/${position}`, { walkedAt: SORT, position }),
    );
    const property = claims.nameFor("HolderSort_2", "/Holder/sort_2", { walkedAt: `${SORT}_2` });
    const other = claims.nameFor("HolderSort_2", "/Holder/Sort_2", { walkedAt: `${SORT}_3` });

    const renames = claims.finalNames(new Set());

    expect([...elements, property, other]).toEqual([
      "HolderSort",
      "HolderSort_2",
      "HolderSort_2_2",
      "HolderSort_2_3",
    ]);
    expect([...renames]).toEqual([
      ["HolderSort_2", "HolderSort_4"],
      ["HolderSort_2_2", "HolderSort_2"],
      ["HolderSort_2_3", "HolderSort_2_2"],
    ]);
  });

  it("finalNames numbers tuple elements by position, not by the order they asked", () => {
    const claims = new EnumNameClaims();
    // A `$ref` to the second element types it first; the walk then meets both in order.
    claims.nameFor("Tup", "/Tup/1");
    claims.nameFor("Tup", "/Tup/0", { walkedAt: TUP, position: 0 });
    claims.nameFor("Tup", "/Tup/1", { walkedAt: TUP, position: 1 });

    expect(claims.finalNames(new Set())).toEqual(
      new Map([
        ["Tup", "Tup_2"],
        ["Tup_2", "Tup"],
      ]),
    );
  });

  it("finalNames orders an owner by its lowest position in the tuple", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Tup", "/Tup/a", { walkedAt: TUP, position: 2 });
    claims.nameFor("Tup", "/Tup/b", { walkedAt: TUP, position: 1 });
    claims.nameFor("Tup", "/Tup/a", { walkedAt: TUP, position: 0 });
    claims.nameFor("Tup", "/Tup/a");

    expect([...claims.finalNames(new Set())]).toEqual([]);
  });

  it("finalNames numbers the elements of two tuples of one name tuple by tuple", () => {
    const claims = new EnumNameClaims();
    const order = "#/components/schemas/Order/properties/sort";
    const orderSort = "#/components/schemas/OrderSort";
    // A `$ref` to `OrderSort/prefixItems/1` comes before the walk.
    claims.nameFor("OrderSort", "up");
    const asked = [
      ["name", order, 0],
      ["asc", order, 1],
      ["id", orderSort, 0],
      ["up", orderSort, 1],
    ] as const;
    for (const [owner, walkedAt, position] of asked) {
      claims.nameFor("OrderSort", owner, { walkedAt, position });
    }

    const renames = claims.finalNames(new Set());
    const finalOf = (owner: string) => {
      const given = claims.nameFor("OrderSort", owner);
      return renames.get(given) ?? given;
    };

    expect(["name", "asc", "id", "up"].map(finalOf)).toEqual([
      "OrderSort",
      "OrderSort_2",
      "OrderSort_3",
      "OrderSort_4",
    ]);
  });

  it("finalNames ranks a location the walk meets first before a later one", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Sort", "/sort", { walkedAt: `${SORT}_property` });
    claims.nameFor("Sort", "/Sort/0", { walkedAt: SORT, position: 0 });
    claims.nameFor("Sort", "/Sort/1", { walkedAt: SORT, position: 1 });

    expect([...claims.finalNames(new Set())]).toEqual([]);
  });

  it("finalNames ranks an owner that only a $ref typed after the walked ones", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Sort", "/elsewhere");
    claims.nameFor("Sort", "/sort", { walkedAt: SORT });

    expect(claims.finalNames(new Set())).toEqual(
      new Map([
        ["Sort", "Sort_2"],
        ["Sort_2", "Sort"],
      ]),
    );
  });

  it("finalNames gives an owner that joins another the other owner's final name", () => {
    const claims = new EnumNameClaims();
    const shared = claims.nameFor("SettingsMode", "shared", { walkedAt: "/a" });
    const own = claims.nameFor("SettingsMode", "/Settings/mode", { walkedAt: "/b" });
    claims.nameFor("SettingsMode", "other", { walkedAt: "/c" });

    const finals = claims.finalNames(new Set(), grouping([["shared", "/Settings/mode"]]));

    expect([shared, own]).toEqual(["SettingsMode", "SettingsMode_2"]);
    expect(finals).toEqual(
      new Map([
        ["SettingsMode_2", "SettingsMode"],
        ["SettingsMode_3", "SettingsMode_2"],
      ]),
    );
  });

  it("finalNames ranks a joined enum where the walk met either owner first", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Mode", "shared", { walkedAt: "/a" });
    claims.nameFor("Mode", "other", { walkedAt: "/b" });
    claims.nameFor("Mode", "/own", { walkedAt: "/c" });

    const finals = claims.finalNames(new Set(), grouping([["shared", "/own"]]));

    expect(finals).toEqual(new Map([["Mode_3", "Mode"]]));
  });

  it("finalNames joins no owner to an owner that did not claim the name", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Mode", "shared", { walkedAt: "/a" });
    claims.nameFor("Mode", "/own", { walkedAt: "/b" });

    const finals = claims.finalNames(new Set(), grouping([["shared", "/elsewhere"]]));

    expect(finals.size).toBe(0);
  });

  it("finalNames gives the owners of one shared enum the name the enum asks for", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("AlphaMode", "/Alpha/mode", { walkedAt: "/a" });
    claims.nameFor("BetaMode", "/Beta/mode", { walkedAt: "/b" });

    const shared = grouping(
      [
        ["/Alpha/mode", "key"],
        ["/Beta/mode", "key"],
      ],
      [["key", "BetaMode"]],
    );
    const finals = claims.finalNames(new Set(), shared);

    expect(finals).toEqual(new Map([["AlphaMode", "BetaMode"]]));
  });

  it("finalNames ranks a shared enum only where a claim asked for its name", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Pair", "/Pair", { walkedAt: "/a" });
    claims.nameFor("Mode", "/Other", { walkedAt: "/b" });
    claims.nameFor("Mode", "/Alpha", { walkedAt: "/c" });

    const shared = grouping(
      [
        ["/Pair", "key"],
        ["/Alpha", "key"],
      ],
      [["key", "Mode"]],
    );
    const finals = claims.finalNames(new Set(), shared);

    // `/Pair` met first asks for another name, so `/Other` keeps `Mode`.
    expect(finals).toEqual(new Map([["Pair", "Mode_2"]]));
  });
});
