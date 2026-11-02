import { describe, expect, it } from "vitest";
import {
  findUnsupportedKeys,
  unsupportedKeysError,
} from "../../../src/adapters/redocly-loader/unsupported-keys.js";

describe("findUnsupportedKeys", () => {
  it("findUnsupportedKeys finds keys at any depth with escaped pointers", () => {
    const parsed = { "a/b": { "c~d": { valueOf: 1 } }, list: [{ hasOwnProperty: true }] };

    const keys = findUnsupportedKeys([{ source: "/x.yaml", parsed }]);

    expect(keys).toEqual(
      expect.arrayContaining([
        { key: "valueOf", pointer: "#/a~1b/c~0d/valueOf", source: "/x.yaml" },
        { key: "hasOwnProperty", pointer: "#/list/0/hasOwnProperty", source: "/x.yaml" },
      ]),
    );
    expect(keys).toHaveLength(2);
  });

  it("findUnsupportedKeys ignores supported keys, scalar documents and values", () => {
    const parsed = { toString: "valueOf", constructor: { enum: ["hasOwnProperty"] } };

    expect(
      findUnsupportedKeys([
        { source: "/a", parsed },
        { source: "/b", parsed: 7 },
      ]),
    ).toEqual([]);
  });

  it("findUnsupportedKeys checks a node shared by YAML aliases once", () => {
    const shared = { valueOf: 1 };

    const keys = findUnsupportedKeys([{ source: "/x", parsed: { a: shared, b: shared } }]);

    expect(keys).toHaveLength(1);
  });

  it("findUnsupportedKeys walks a deeply nested document without recursion", () => {
    let parsed: Record<string, unknown> = { valueOf: 1 };
    for (let level = 0; level < 100_000; level++) {
      parsed = { next: parsed };
    }

    expect(findUnsupportedKeys([{ source: "/x", parsed }])).toHaveLength(1);
  });
});

describe("unsupportedKeysError", () => {
  it("unsupportedKeysError lists the first keys in the message and all of them in details", () => {
    const keys = Array.from({ length: 7 }, (_, index) => ({
      key: "valueOf",
      pointer: `#/k${index}/valueOf`,
      source: "/x",
    }));
    const cause = new TypeError("Cannot convert undefined or null to object");

    const error = unsupportedKeysError(keys, cause);

    expect(error.code).toBe("SCHEMA_KEY_UNSUPPORTED");
    expect(error.message).toContain('"valueOf" at #/k4/valueOf in /x and 2 more.');
    expect(error.message).not.toContain("#/k5/");
    expect(error.details).toEqual({ keys });
    expect(error.cause).toBe(cause);
  });
});
