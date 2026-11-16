import { describe, expect, it } from "vitest";
import { EnumOwners } from "../../../../src/application/transform/footer/enum-owners.js";
import type { EnumDeclarationRequest } from "../../../../src/application/transform/schema/schema-context.js";

function request(values: (string | number)[], isAtSharedLocation: boolean): EnumDeclarationRequest {
  return {
    name: "/Settings/mode",
    isComponentSchema: false,
    values,
    metadata: [],
    isAtSharedLocation,
  };
}

describe("EnumOwners", () => {
  it("ownerOf gives a request at a location of its own the location", () => {
    const owners = new EnumOwners();

    expect(owners.ownerOf(request(["a"], false))).toBe("/Settings/mode");
    expect(owners.ownerOf(request(["b"], false))).toBe("/Settings/mode");
  });

  it("ownerOf gives a shared-location request its location with its values", () => {
    const owners = new EnumOwners();

    const owner = owners.ownerOf(request(["b", "a"], true));

    expect(owner).toBe(JSON.stringify(["/Settings/mode", ['"a"', '"b"']]));
    expect(owners.ownerOf(request(["a", "b"], true))).toBe(owner);
    expect(owners.ownerOf(request(["a"], true))).not.toBe(owner);
  });

  it("mergedOwners joins a shared-location owner to the own enum of exactly its values", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request(["on"], false));
    const same = owners.ownerOf(request(["off", "on"], true));
    const fewer = owners.ownerOf(request(["on"], true));
    const more = owners.ownerOf(request(["on", "off", "x"], true));
    owners.ownerOf(request(["off"], false));

    const merged = owners.mergedOwners();

    expect(merged.get(same)).toBe("/Settings/mode");
    expect([merged.has(fewer), merged.has(more)]).toEqual([false, false]);
  });

  it("mergedOwners does not depend on the order of own and shared requests", () => {
    const sharedFirst = new EnumOwners();
    const owner = sharedFirst.ownerOf(request(["on"], true));
    sharedFirst.ownerOf(request(["on"], false));
    const ownFirst = new EnumOwners();
    ownFirst.ownerOf(request(["on"], false));
    ownFirst.ownerOf(request(["on"], true));

    expect(sharedFirst.mergedOwners()).toEqual(new Map([[owner, "/Settings/mode"]]));
    expect(ownFirst.mergedOwners()).toEqual(sharedFirst.mergedOwners());
  });

  it("mergedOwners joins no shared-location owner where the location has no own enum", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request(["on"], true));

    expect(owners.mergedOwners().size).toBe(0);
  });

  it("mergedOwners keeps a number and a string of one text apart", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request([1], false));
    owners.ownerOf(request(["1"], true));

    expect(owners.mergedOwners().size).toBe(0);
  });
});
