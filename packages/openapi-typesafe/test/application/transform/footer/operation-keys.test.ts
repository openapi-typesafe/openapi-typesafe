import { describe, expect, it } from "vitest";
import { OperationKeys } from "../../../../src/application/transform/footer/operation-keys.js";

describe("OperationKeys", () => {
  it("keyFor keeps the first ID and numbers each repeat from 2", () => {
    const keys = new OperationKeys();

    const names = ["dup", "dup", "dup"].map((id) => keys.keyFor(id));

    expect(names).toEqual(["dup", "dup2", "dup3"]);
  });

  it("keyFor skips a number that another operation of the document has as its ID", () => {
    const keys = new OperationKeys(new Set(["dup", "dup2"]));

    const names = ["dup", "dup", "dup2"].map((id) => keys.keyFor(id));

    expect(names).toEqual(["dup", "dup3", "dup2"]);
  });
});
