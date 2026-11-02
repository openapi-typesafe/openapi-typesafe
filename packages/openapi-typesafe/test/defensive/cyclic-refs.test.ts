import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";
import { documentWith, generateCompiling, generationFailure } from "./defensive-helpers.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

describe("cyclic $ref", () => {
  it("a schema that contains itself generates a recursive type", async () => {
    const output = await generateCompiling(
      documentWith({ Node: { type: "object", properties: { next: ref("Node") } } }),
    );

    expect(output).toContain('next?: components["schemas"]["Node"];');
  });

  it.each([
    ["mutual properties", { A: { properties: { b: ref("B") } }, B: { properties: { a: ref("A") } } }],
    ["an array property", { A: { properties: { all: { type: "array", items: ref("A") } } } }],
    ["additionalProperties", { A: { additionalProperties: ref("A") } }],
    ["allOf with an object", { A: { allOf: [ref("B")] }, B: ref2("A") }],
    ["a long ring", { A: ref2("B"), B: ref2("C"), C: ref2("A") }],
  ])("a cycle through %s generates and compiles", async (_name, schemas) => {
    await generateCompiling(documentWith(schemas));
  });

  it.each([
    ["arrays", { A: { type: "array", items: ref("B") }, B: { type: "array", items: ref("A") } }],
    ["allOf", { A: { allOf: [ref("B")] }, B: { allOf: [ref("A")] } }],
    ["oneOf", { A: { oneOf: [ref("B"), { type: "null" }] }, B: { oneOf: [ref("A")] } }],
  ])("a cycle through %s alone generates the types TypeScript rejects, as upstream does", async (_name, schemas) => {
    // A cycle with no object type on it has no finite TypeScript form through indexed access
    // types; openapi-typescript prints the same output. Documented in docs/advanced.md.
    const output = astToString(await openapiTS(documentWith(schemas) as never, { silent: true }));

    expect(typeErrorsOf(output)).toEqual([
      "'A' is referenced directly or indirectly in its own type annotation.",
      "'B' is referenced directly or indirectly in its own type annotation.",
    ]);
  });

  it.each([
    ["a schema that is a $ref to itself", { A: ref("A") }],
    ["two schemas that are $refs to each other", { A: ref("B"), B: ref("A") }],
  ])("%s fails with SCHEMA_REF_INVALID", async (_name, schemas) => {
    const error = await generationFailure(documentWith(schemas));

    expect(error).toMatchObject({
      code: "SCHEMA_REF_INVALID",
      message: "Self-referencing circular pointer",
      details: { reason: "cycle" },
    });
  });
});

/** An object whose only property refers to `name`. */
function ref2(name: string) {
  return { type: "object", properties: { next: ref(name) } };
}
