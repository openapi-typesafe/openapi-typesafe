import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

/**
 * A value nested deeper than the JavaScript stack allows a recursive walk to read. JSON sends such
 * a body, so its key must hold all of it, be the same on every call, and stay within the depth
 * TanStack Query's hash can write. Objects deeper than one walk reads are read in walks of their
 * own, and listed under `"(deeper)"`.
 */

const NO_BASE_URL = { baseUrl: "" };
/** Deeper than a recursive walk of the key could read on Node's default stack. */
const STACK_DEEP = 5000;
/** Deeper than the walks of a key read, so the last part of the value is its JSON text. */
const PAST_SEGMENTS = 10_300;
/** Deeper than one walk reads, so the key has segments, and shallow enough to read in a test. */
const PAST_ONE_WALK = 150;
/** As many objects as one walk reads: the deepest is the last read in the first walk. */
const ONE_WALK = 100;
/** More calls than it took the JIT to change where the stack ran out. */
const CALLS = 20;

interface Node {
  readonly c: Node | number;
}

/** A chain of `depth` objects `{ c }` that ends in `leaf`. */
function nest(depth: number, leaf: number): Node | number {
  let value: Node | number = leaf;
  for (let level = 0; level < depth; level++) {
    value = { c: value };
  }
  return value;
}

/** The key init of a request with this init. */
function keyOf(init: object): object | undefined {
  return queryKeyInit(init, NO_BASE_URL);
}

/** The hash of the key init of a request with this init. */
function hashOf(init: object): string {
  return hashKey([keyOf(init)]);
}

describe("queryKeyInit values deeper than the stack", () => {
  it("queryKeyInit with a body deeper than the stack gives one key on every call", () => {
    const hashes = new Set(
      Array.from({ length: CALLS }, () => hashOf({ body: nest(STACK_DEEP, 1) })),
    );

    expect(hashes.size).toBe(1);
  });

  it("queryKeyInit with bodies that differ below the stack gives other keys", () => {
    expect(hashOf({ body: nest(STACK_DEEP, 1) })).not.toBe(hashOf({ body: nest(STACK_DEEP, 2) }));
  });

  it("queryKeyInit with query params that differ below the stack gives other keys", () => {
    const query = (leaf: number) => ({ params: { query: { tree: nest(STACK_DEEP, leaf) } } });

    expect(hashOf(query(1))).not.toBe(hashOf(query(2)));
  });

  it("queryKeyInit with bodies that differ below every walk gives other keys", () => {
    expect(hashOf({ body: nest(PAST_SEGMENTS, 1) })).not.toBe(
      hashOf({ body: nest(PAST_SEGMENTS, 2) }),
    );
  });

  it("queryKeyInit with a body below every walk keys its last part by its JSON text", () => {
    const key = keyOf({ body: nest(PAST_SEGMENTS, 1) }) as Record<string, unknown[]>;

    expect(key["(deeper)"]?.at(-1)).toMatch(/^\{"c":.*"c":1\}+$/);
  });

  it("queryKeyInit with a body deeper than one walk keeps its key through a JSON round trip", () => {
    const key = keyOf({ body: nest(PAST_ONE_WALK, 1) });

    expect(JSON.parse(JSON.stringify(key))).toStrictEqual(key);
  });

  it("queryKeyInit with a body deeper than one walk lists the deeper part in order", () => {
    const key = keyOf({ body: nest(PAST_ONE_WALK, 1) }) as Record<string, unknown>;

    expect(key["(deeper)"]).toHaveLength(1);
    expect(JSON.stringify(key["(deeper)"])).toContain('"c":1}');
  });

  it("queryKeyInit with a body as deep as one walk reads lists nothing deeper", () => {
    expect(keyOf({ body: nest(ONE_WALK, 1) })).not.toHaveProperty("(deeper)");
    expect(keyOf({ body: nest(ONE_WALK + 1, 1) })).toHaveProperty("(deeper)");
  });
});

describe("queryKeyInit deep references", () => {
  it("queryKeyInit with a deep object in two members gives the key of one read twice", () => {
    const shared = nest(PAST_ONE_WALK, 1);
    const twice = keyOf({ body: { a: shared, b: shared } }) as Record<string, unknown>;

    expect(twice["(deeper)"]).toHaveLength(1);
    expect(hashOf({ body: { a: shared, b: shared } })).not.toBe(
      hashOf({ body: { a: shared, b: nest(PAST_ONE_WALK, 2) } }),
    );
  });

  it("queryKeyInit with a reference back from below one walk gives a key", () => {
    const top: { c?: unknown } = {};
    let bottom: { c?: unknown } = top;
    for (let level = 0; level < PAST_ONE_WALK; level++) {
      const next = {};
      bottom.c = next;
      bottom = next;
    }
    bottom.c = top;

    expect(hashOf({ body: top })).toBe(hashOf({ body: top }));
  });

  it("queryKeyInit with a getter that makes a deeper object without end gives a key", () => {
    const endless = (): object => ({
      get c() {
        return endless();
      },
    });

    expect(() => hashOf({ body: endless() })).not.toThrow();
  });
});
