import { describe, expect, it } from "vitest";
import { EnumOwners } from "../../../../src/application/transform/footer/enum-owners.js";
import type { EnumDeclarationRequest } from "../../../../src/application/transform/schema/schema-context.js";

const OWN = "";
const ITEMS = "items";
const RECORD = "record";

function request(values: (string | number)[], sharedSlot: string): EnumDeclarationRequest {
  return { name: "/Settings/mode", isComponentSchema: false, values, metadata: [], sharedSlot };
}

/** The owner each request ends with: its group, or the location's own owner (`mergedOwners`). */
function finalOwner(owners: EnumOwners, owner: string): string {
  return owners.mergedOwners().get(owner) ?? owner;
}

describe("EnumOwners", () => {
  it("ownerOf gives a request at a location of its own the location", () => {
    const owners = new EnumOwners();

    expect(owners.ownerOf(request(["a"], OWN), "SettingsMode")).toBe("/Settings/mode");
    expect(owners.ownerOf(request(["b"], OWN), "SettingsMode")).toBe("/Settings/mode");
  });

  it("ownerOf gives a shared-location request its location with its values", () => {
    const owners = new EnumOwners();

    const owner = owners.ownerOf(request(["b", "a"], ITEMS), "SettingsMode");

    expect(owner).toBe(JSON.stringify(["/Settings/mode", ['"a"', '"b"']]));
  });

  it("ownerOf gives requests of one slot one owner whatever their values", () => {
    const owners = new EnumOwners();

    const first = owners.ownerOf(request(["a"], ITEMS), "SettingsMode");
    const second = owners.ownerOf(request(["a", "b"], ITEMS), "SettingsMode");

    expect(second).toBe(first);
  });

  it("ownerOf gives requests of the same values one owner whatever their slots", () => {
    const owners = new EnumOwners();

    const first = owners.ownerOf(request(["a"], ITEMS), "SettingsMode");
    const second = owners.ownerOf(request(["a"], RECORD), "SettingsMode");

    expect(second).toBe(first);
  });

  it("ownerOf keeps requests of other slots and other values apart", () => {
    const owners = new EnumOwners();

    const first = owners.ownerOf(request(["a"], ITEMS), "SettingsMode");
    const second = owners.ownerOf(request(["b"], RECORD), "SettingsMode");

    expect(second).not.toBe(first);
    expect(finalOwner(owners, second)).not.toBe(finalOwner(owners, first));
  });

  it("mergedOwners joins two groups a later request links into the one that asked first", () => {
    const owners = new EnumOwners();
    const first = owners.ownerOf(request(["a"], ITEMS), "SettingsMode");
    const second = owners.ownerOf(request(["b"], RECORD), "SettingsMode");

    const linking = owners.ownerOf(request(["b"], ITEMS), "SettingsMode");

    expect(linking).toBe(first);
    expect(finalOwner(owners, second)).toBe(first);
  });

  it("mergedOwners keeps the values of a joined group that the linking request does not list", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request(["a", "b", "c"], OWN), "SettingsMode");
    const first = owners.ownerOf(request(["a"], ITEMS), "SettingsMode");
    owners.ownerOf(request(["b"], RECORD), "SettingsMode");
    const joined = owners.ownerOf(request(["c"], RECORD), "SettingsMode");

    owners.ownerOf(request(["b"], ITEMS), "SettingsMode");

    expect([finalOwner(owners, first), finalOwner(owners, joined)]).toEqual([
      "/Settings/mode",
      "/Settings/mode",
    ]);
  });

  it("mergedOwners joins a group to the own enum of exactly the group's values", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request(["on"], OWN), "SettingsMode");
    const joined = owners.ownerOf(request(["on"], ITEMS), "SettingsMode");
    owners.ownerOf(request(["off", "on"], ITEMS), "SettingsMode");
    const fewer = owners.ownerOf(request(["on"], RECORD), "SettingsMode");
    owners.ownerOf(request(["off"], OWN), "SettingsMode");

    expect(finalOwner(owners, joined)).toBe("/Settings/mode");
    expect(finalOwner(owners, fewer)).toBe("/Settings/mode");
  });

  it("mergedOwners joins no group whose values are not the own enum's", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request(["on"], OWN), "SettingsMode");
    const more = owners.ownerOf(request(["on", "off"], ITEMS), "SettingsMode");
    const other = owners.ownerOf(request(["x"], RECORD), "SettingsMode");

    expect([finalOwner(owners, more), finalOwner(owners, other)]).toEqual([more, other]);
  });

  it("mergedOwners does not depend on the order of own and shared requests", () => {
    const sharedFirst = new EnumOwners();
    const owner = sharedFirst.ownerOf(request(["on"], ITEMS), "SettingsMode");
    sharedFirst.ownerOf(request(["on"], OWN), "SettingsMode");
    const ownFirst = new EnumOwners();
    ownFirst.ownerOf(request(["on"], OWN), "SettingsMode");
    ownFirst.ownerOf(request(["on"], ITEMS), "SettingsMode");

    expect(sharedFirst.mergedOwners().get(owner)).toBe("/Settings/mode");
    expect(ownFirst.mergedOwners()).toEqual(sharedFirst.mergedOwners());
  });

  it("mergedOwners joins no group where the location has no own enum", () => {
    const owners = new EnumOwners();
    const owner = owners.ownerOf(request(["on"], ITEMS), "SettingsMode");

    expect(finalOwner(owners, owner)).toBe(owner);
  });

  it("mergedOwners keeps a number and a string of one text apart", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request([1], OWN), "SettingsMode");
    const owner = owners.ownerOf(request(["1"], ITEMS), "SettingsMode");

    expect(finalOwner(owners, owner)).toBe(owner);
  });

  it("requests lists every request with its owner and name, in the order they asked", () => {
    const owners = new EnumOwners();
    const own = request(["a"], OWN);
    const shared = request(["b"], ITEMS);

    const ownOwner = owners.ownerOf(own, "SettingsMode");
    const sharedOwner = owners.ownerOf(shared, "Other");

    expect(owners.requests()).toEqual([
      { owner: ownOwner, ownName: "SettingsMode", request: own },
      { owner: sharedOwner, ownName: "Other", request: shared },
    ]);
  });
});
