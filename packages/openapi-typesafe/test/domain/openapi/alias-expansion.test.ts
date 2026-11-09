import { describe, expect, it } from "vitest";
import {
  ALIAS_EXPANSION_MIN_NODES,
  countNodes,
  isAliasExpansionExcessive,
} from "../../../src/domain/openapi/alias-expansion.js";

/** A "billion laughs" value: each level holds the previous level `width` times. */
function laughs(levels: number, width: number): unknown {
  let level: unknown = Array(width).fill("lol");
  for (let index = 1; index < levels; index++) {
    level = Array(width).fill(level);
  }
  return level;
}

describe("countNodes", () => {
  it("countNodes of a tree without shared objects has equal stored and expanded counts", () => {
    const document = { a: [1, 2], b: { c: "x" } };

    expect(countNodes(document)).toEqual({ stored: 6, expanded: 6 });
  });

  it("countNodes counts a shared object once when stored and each time when expanded", () => {
    const shared = { x: 1 };

    expect(countNodes({ a: shared, b: shared })).toEqual({ stored: 3, expanded: 5 });
  });

  it("countNodes of a primitive is one node", () => {
    expect(countNodes("text")).toEqual({ stored: 1, expanded: 1 });
  });

  it("countNodes ends on a cycle", () => {
    const node: { self?: unknown } = {};
    node.self = node;

    expect(countNodes(node)).toEqual({ stored: 1, expanded: 2 });
  });

  it("countNodes handles nesting deeper than the call stack", () => {
    let deep: unknown = "leaf";
    for (let level = 0; level < 100_000; level++) {
      deep = [deep];
    }

    expect(countNodes(deep).expanded).toBe(100_001);
  });
});

/**
 * A million objects take 0.2 s on a laptop and took 7 s on a loaded macOS Intel runner, past the
 * default 5 s limit; 60 s leaves room for such a runner and still fails on a hang.
 */
const LARGE_ARRAY_TIMEOUT_MS = 60_000;

describe("countNodes of a large array", () => {
  it(
    "countNodes of an array of a million objects counts them without overflowing the stack",
    () => {
      const objects = Array.from({ length: 1_000_000 }, () => ({}));

      expect(countNodes(objects)).toEqual({ stored: 1_000_001, expanded: 1_000_001 });
    },
    LARGE_ARRAY_TIMEOUT_MS,
  );
});

describe("isAliasExpansionExcessive", () => {
  it("isAliasExpansionExcessive refuses a billion laughs document", () => {
    expect(isAliasExpansionExcessive(countNodes(laughs(9, 10)))).toBe(true);
  });

  it("isAliasExpansionExcessive allows moderate anchor reuse", () => {
    expect(isAliasExpansionExcessive(countNodes(laughs(3, 10)))).toBe(false);
  });

  it("isAliasExpansionExcessive allows a large document without aliases", () => {
    const counts = {
      stored: ALIAS_EXPANSION_MIN_NODES * 3,
      expanded: ALIAS_EXPANSION_MIN_NODES * 3,
    };

    expect(isAliasExpansionExcessive(counts)).toBe(false);
  });
});
