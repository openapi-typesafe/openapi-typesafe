import { describe, expect, it } from "vitest";
import { EnumNameClaims } from "../../../../src/application/transform/footer/enum-name-claims.js";

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
      claims.nameFor("HolderSort", `/Holder/sort/${position}`, position),
    );
    const property = claims.nameFor("HolderSort_2", "/Holder/sort_2");
    const other = claims.nameFor("HolderSort_2", "/Holder/Sort_2");

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
    claims.nameFor("Tup", "/Tup/1", 1);
    claims.nameFor("Tup", "/Tup/0", 0);

    expect([...claims.finalNames(new Set())]).toEqual([
      ["Tup_2", "Tup"],
      ["Tup", "Tup_2"],
    ]);
  });

  it("finalNames orders an owner by its lowest position in the tuple", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Tup", "/Tup/a", 2);
    claims.nameFor("Tup", "/Tup/b", 1);
    claims.nameFor("Tup", "/Tup/a", 0);
    claims.nameFor("Tup", "/Tup/a");

    expect([...claims.finalNames(new Set())]).toEqual([]);
  });

  it("finalNames ranks a tuple where its first element asked, among other owners", () => {
    const claims = new EnumNameClaims();
    claims.nameFor("Sort", "/Sort/1", 1);
    claims.nameFor("Sort", "/sort");
    claims.nameFor("Sort", "/Sort/0", 0);

    expect([...claims.finalNames(new Set())]).toEqual([
      ["Sort_3", "Sort"],
      ["Sort", "Sort_2"],
      ["Sort_2", "Sort_3"],
    ]);
  });
});
