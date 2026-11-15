import { hashKey } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

/**
 * A value that is a Map or a Set by its type tag only, such as a MobX observable Map or Set, keeps
 * its contents in its own members, and some of those change each time it is read. The key holds
 * its contents alone, so the same contents give one key on every render. A Map or a Set of this
 * realm keeps its contents where no member is, so its own members stay in the key.
 */

const NO_BASE_URL = { baseUrl: "" };
const TAG = "cat";
const OTHER_TAG = "dog";

/** Like MobX's ObservableSet: the type tag of a Set, its state in own members, read counts. */
class TrackedSet {
  readonly data_: Set<string>;
  readonly atom_ = { lastAccessedBy_: 0 };

  constructor(values: readonly string[]) {
    this.data_ = new Set(values);
  }

  get [Symbol.toStringTag](): string {
    return "Set";
  }

  *[Symbol.iterator](): IterableIterator<string> {
    this.atom_.lastAccessedBy_ += 1;
    yield* this.data_;
  }

  toJSON(): string[] {
    return Array.from(this);
  }
}

/** Like MobX's ObservableMap: the type tag of a Map, its state in own members, read counts. */
class TrackedMap {
  readonly data_: Map<string, number>;
  readonly keysAtom_ = { lastAccessedBy_: 0 };

  constructor(entries: readonly (readonly [string, number])[]) {
    this.data_ = new Map(entries);
  }

  get [Symbol.toStringTag](): string {
    return "Map";
  }

  *[Symbol.iterator](): IterableIterator<[string, number]> {
    this.keysAtom_.lastAccessedBy_ += 1;
    yield* this.data_;
  }
}

/** A Set of this realm with a member of the caller, which JSON sends. */
class LabeledSet extends Set<string> {
  readonly label: string;

  constructor(values: readonly string[], label: string) {
    super(values);
    this.label = label;
  }
}

/** The hash of the key init of a request with this init. */
function hashOf(init: object): string {
  return hashKey([queryKeyInit(init, NO_BASE_URL)]);
}

describe("queryKeyInit values that are a Map or a Set by their type tag", () => {
  it("queryKeyInit with a tracked Set query param gives one key on every read", () => {
    const tags = new TrackedSet([TAG]);

    expect(hashOf({ params: { query: { tags } } })).toBe(hashOf({ params: { query: { tags } } }));
  });

  it("queryKeyInit with a tracked Set query param keys its values alone", () => {
    expect(
      queryKeyInit({ params: { query: { tags: new TrackedSet([TAG]) } } }, NO_BASE_URL),
    ).toEqual({ params: { query: { tags: { "values()": [TAG], "toJSON()": [TAG] } } } });
  });

  it("queryKeyInit with tracked Sets of other values gives other keys", () => {
    expect(hashOf({ params: { query: { tags: new TrackedSet([TAG]) } } })).not.toBe(
      hashOf({ params: { query: { tags: new TrackedSet([OTHER_TAG]) } } }),
    );
  });

  it("queryKeyInit with a tracked Map in a body gives one key on every read", () => {
    const counts = new TrackedMap([[TAG, 1]]);

    expect(hashOf({ body: { counts } })).toBe(hashOf({ body: { counts } }));
    expect(queryKeyInit({ body: { counts } }, NO_BASE_URL)).toEqual({
      body: { counts: { "entries()": [[TAG, 1]] } },
    });
  });

  it("queryKeyInit with a tracked Set as a whole body gives one key on every read", () => {
    const body = new TrackedSet([TAG]);

    expect(hashOf({ body })).toBe(hashOf({ body }));
  });
});

describe("queryKeyInit a Map or a Set of this realm", () => {
  it("queryKeyInit with a Set subclass keeps its own members beside its values", () => {
    expect(hashOf({ body: { tags: new LabeledSet([TAG], "a") } })).not.toBe(
      hashOf({ body: { tags: new LabeledSet([TAG], "b") } }),
    );
  });
});

describe("queryKeyInit in a realm without a class", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["no global", undefined],
    ["a global that is no class", {}],
  ])("queryKeyInit with %s URLSearchParams keys a body by its type tag", (_, global) => {
    vi.stubGlobal("URLSearchParams", global);
    const body = { [Symbol.toStringTag]: "URLSearchParams", toString: () => "a=1" };

    expect(queryKeyInit({ body }, NO_BASE_URL)).toEqual({
      body: "a=1",
      bodyType: "URLSearchParams",
    });
  });
});
