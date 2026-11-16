import { describe, expect, it } from "vitest";
import { withoutOptionalUndefined } from "../../../src/application/transform/ref-pointer/optional-target.js";
import {
  type RefPointer,
  refPointerOf,
} from "../../../src/application/transform/ref-pointer/pointer-walk.js";
import type { RefResolver } from "../../../src/application/transform/schema/schema-context.js";
import { irReference } from "../../../src/domain/ir/constructors.js";
import { parseRefPointer } from "../../../src/domain/openapi/json-pointer.js";
import { DEFAULT_TRANSFORM_OPTIONS } from "../../fakes/transform-context.js";

/** The `undefined` that a pointer to an optional property adds, left out by `ref-pointers`. */

const STRING = { type: "string" };
const SCHEMAS = {
  Contact: { type: "object", properties: { email: STRING, name: STRING }, required: ["name"] },
  Composed: { allOf: [{ type: "object", properties: { email: STRING } }] },
  Flag: { type: "array", items: true },
};
const DOCUMENT = { components: { schemas: SCHEMAS } };
const REFS: RefResolver = {
  resolve: (ref) =>
    parseRefPointer(ref).reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null ? (node as never)[segment] : undefined,
      DOCUMENT,
    ),
};
const TYPE = irReference("T");

function pointer(ref: string): RefPointer {
  return refPointerOf(`#/components/schemas/${ref}`) as RefPointer;
}

function typed(ref: string) {
  return withoutOptionalUndefined(TYPE, pointer(ref), DEFAULT_TRANSFORM_OPTIONS, REFS);
}

describe("withoutOptionalUndefined", () => {
  it("withoutOptionalUndefined excludes undefined from a pointer to an optional property", () => {
    expect(typed("Contact/properties/email")).toEqual(
      irReference("Exclude", [TYPE, { kind: "keyword", keyword: "undefined" }]),
    );
  });

  it.each([
    ["a required property", "Contact/properties/name"],
    ["a keyword", "Flag/items"],
    ["a property of an owner the walk cannot type", "Composed/allOf/0/properties/email"],
    ["a property of an owner that is no object", "Flag/items/properties/email"],
  ])("withoutOptionalUndefined keeps the type of %s", (_label, ref) => {
    expect(typed(ref)).toBe(TYPE);
  });
});
