import { describe, expect, it } from "vitest";
import { assertNever } from "../../src/domain/assert-never.js";

describe("assertNever", () => {
  it("assertNever with a value outside the union throws with the value", () => {
    expect(() => assertNever({ kind: "unknown" } as never)).toThrow(
      'Unexpected variant: {"kind":"unknown"}',
    );
  });
});
