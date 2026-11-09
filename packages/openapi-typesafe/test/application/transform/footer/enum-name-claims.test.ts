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

  it("nameFor numbers a name the output may need", () => {
    const claims = new EnumNameClaims(new Set(["Blob"]));

    expect(claims.nameFor("Blob", "/Blob")).toBe("Blob_2");
  });

  it("givenBack lists the stand-ins whose name the output does not need", () => {
    const claims = new EnumNameClaims(new Set(["Blob", "Record"]));
    claims.nameFor("Blob", "/Blob");
    claims.nameFor("Record", "/Record");

    const renames = claims.givenBack(new Set(["Record"]));

    expect([...renames]).toEqual([["Blob_2", "Blob"]]);
  });

  it("givenBack keeps the number of a later owner of a name", () => {
    const claims = new EnumNameClaims(new Set(["Blob"]));
    claims.nameFor("Blob", "/Blob");
    claims.nameFor("Blob", "/blob");

    expect([...claims.givenBack(new Set())]).toEqual([["Blob_2", "Blob"]]);
  });
});
