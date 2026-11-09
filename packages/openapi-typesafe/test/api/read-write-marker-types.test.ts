import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { READ_WRITE_MARKER_TYPES } from "../../src/application/transform/helper-types.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--read-write-markers` writes its own copy of `Readable` / `Writable` into the output, because
 * generated files must not depend on a package. The copy must declare exactly what
 * openapi-typesafe-fetch declares for its helper types (ADR-014), so a fix in one cannot miss the
 * other.
 */

const HELPERS_SOURCE = new URL("../../../openapi-typesafe-fetch/src/helpers.ts", import.meta.url);
const FIRST_SHARED_DECLARATION = "type ReadWritePrimitive";

/** The declarations without comments, whitespace and the separators formatters disagree on. */
function normalize(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, "")
    .replace(/;/g, "")
    .replace(/,(?=[>}\]])/g, "");
}

function sharedDeclarations(text: string): string {
  return normalize(text.slice(text.indexOf(FIRST_SHARED_DECLARATION)));
}

describe("read-write marker helper types", () => {
  it("the generated helpers declare the same types as openapi-typesafe-fetch", () => {
    const helpers = readFileSync(HELPERS_SOURCE, "utf8");

    expect(sharedDeclarations(READ_WRITE_MARKER_TYPES)).toBe(sharedDeclarations(helpers));
  });

  it("the generated helpers compile and keep tuples, branded primitives and any", () => {
    const usage = [
      READ_WRITE_MARKER_TYPES,
      "type UserId = string & { readonly __brand: 'UserId' };",
      "const tuple: Readable<[string, number]> = ['a', 1];",
      "const id: Readable<UserId> = 'x' as UserId;",
      "const pet: Writable<{ id: $Read<number>; x?: null }> = { x: null };",
      "const sent: Writable<{ meta: any }> = { meta: { size: 1 } };",
      "const read: Readable<{ meta: any }>['meta'] = 1;",
      "export { tuple, id, pet, sent, read };",
    ].join("\n");

    expect(typeErrorsOf(usage)).toEqual([]);
  });
});
