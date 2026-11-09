import { describe, expect, it } from "vitest";
import { repairBundledRefs } from "../../../src/adapters/redocly-loader/bundled-ref-repair.js";
import { findRefHolders } from "../../../src/adapters/redocly-loader/ref-holders.js";
import { parseRefPointer } from "../../../src/domain/openapi/json-pointer.js";

function bundledWith(
  ref: string,
  key: string,
): { components: { schemas: Record<string, unknown> } } {
  return { components: { schemas: { [key]: { type: "string" }, Use: { $ref: ref } } } };
}

function refOf(document: { components: { schemas: Record<string, unknown> } }): unknown {
  return (document.components.schemas.Use as { $ref: string }).$ref;
}

describe("repairBundledRefs", () => {
  it.each([
    ["#/components/schemas/a~0b", "a~0b", "#/components/schemas/a~00b"],
    ["#/components/schemas/a~1b", "a~1b", "#/components/schemas/a~01b"],
    ["#/components/schemas/50%", "50%", "#/components/schemas/50%25"],
    ["#/components/schemas/50%#", "50%#", "#/components/schemas/50%25%23"],
  ])("repairBundledRefs with %s pointing at the raw key escapes it", (ref, key, repaired) => {
    const document = bundledWith(ref, key);

    repairBundledRefs(document);

    expect(refOf(document)).toBe(repaired);
  });

  it.each([
    ["a ref that resolves", "#/components/schemas/a~0b", "a~b"],
    ["a ref to a missing key", "#/components/schemas/Missing", "Other"],
    ["an external ref", "./other.yaml#/50%", "50%"],
  ])("repairBundledRefs leaves %s as it is", (_case, ref, key) => {
    const document = bundledWith(ref, key);

    repairBundledRefs(document);

    expect(refOf(document)).toBe(ref);
  });
});

describe("findRefHolders", () => {
  it("findRefHolders lists each $ref with its pointer, inside arrays too", () => {
    const document = { a: [{ $ref: "#/x" }], "b/c": { $ref: "#/y" }, d: { $ref: 1 } };

    const pointers = findRefHolders(document).map((holder) => holder.pointer);

    expect(pointers.sort()).toEqual(["#/a/0", "#/b~1c"]);
  });

  it("findRefHolders escapes keys like the generator, so each pointer reads back", () => {
    const document = { "a#": { "#/%41": { $ref: "#/x" } }, "50%": { $ref: "#/y" } };

    const pointers = findRefHolders(document).map((holder) => holder.pointer);

    expect(pointers.sort()).toEqual(["#/50%25", "#/a%23/%23~1%2541"]);
    expect(pointers.map(parseRefPointer).sort()).toEqual([["50%"], ["a#", "#/%41"]]);
  });

  it("findRefHolders visits a node shared by aliases once and stops on a cycle", () => {
    const shared: Record<string, unknown> = { $ref: "#/s" };
    shared.self = shared;
    const document = { first: shared, second: shared };

    expect(findRefHolders(document)).toHaveLength(1);
  });
});
