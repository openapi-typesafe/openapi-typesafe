import { describe, expect, it } from "vitest";
import { toPropertyName } from "../../../src/domain/ir/property-name.js";

describe("toPropertyName", () => {
  it.each([
    [0, { kind: "number", text: "0" }],
    [42, { kind: "number", text: "42" }],
    [-1, { kind: "string", value: "-1" }],
    ["7", { kind: "number", text: "7" }],
    ["1.5", { kind: "number", text: "1.5" }],
    ["-1", { kind: "string", value: "-1" }],
    ["007", { kind: "string", value: "007" }],
    ["id", { kind: "identifier", text: "id" }],
    ["_$x9", { kind: "identifier", text: "_$x9" }],
    ["9lives", { kind: "string", value: "9lives" }],
    ["content-type", { kind: "string", value: "content-type" }],
    ["", { kind: "string", value: "" }],
  ] as const)("toPropertyName(%j) is %j", (index, expected) => {
    expect(toPropertyName(index)).toEqual(expected);
  });
});
