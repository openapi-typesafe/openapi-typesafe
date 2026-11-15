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

  it("ownerOf joins a shared-location request to the own enum of exactly its values", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request(["on"], false));
    owners.ownerOf(request(["off"], false));

    expect(owners.ownerOf(request(["off", "on"], true))).toBe("/Settings/mode");
    expect(owners.ownerOf(request(["on"], true))).not.toBe("/Settings/mode");
    expect(owners.ownerOf(request(["on", "off", "x"], true))).not.toBe("/Settings/mode");
  });

  it("ownerOf keeps a number and a string of one text apart", () => {
    const owners = new EnumOwners();
    owners.ownerOf(request([1], false));

    expect(owners.ownerOf(request(["1"], true))).not.toBe("/Settings/mode");
  });
});
