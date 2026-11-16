import { runInNewContext } from "node:vm";
import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
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

/**
 * Like MobX's ObservableSet: the type tag of a Set, its state in own members, read counts, and a
 * `toJSON` of its values.
 */
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

/**
 * Like MobX's ObservableMap: the type tag of a Map, its state in own members, read counts, and a
 * `toJSON` of its entries.
 */
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

  toJSON(): [string, number][] {
    return Array.from(this);
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
      body: { counts: [[TAG, 1]] },
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

/** A DTO with the type tag of a Set that keeps its data in own members, as JSON sends it. */
class TaggedSelection {
  readonly ids: string;

  constructor(ids: string) {
    this.ids = ids;
  }

  get [Symbol.toStringTag](): string {
    return "Set";
  }
}

/** Like `TaggedSelection`, iterable, without a `toJSON`: JSON still sends its own members. */
class IterableSelection extends TaggedSelection {
  *[Symbol.iterator](): IterableIterator<string> {
    yield TAG;
  }
}

/** A value made in a realm of its own, as an iframe or a Jest environment makes it. */
function inOtherRealm(code: string): object {
  return runInNewContext(code) as object;
}

describe("queryKeyInit values with the type tag of a Map or a Set and no contents", () => {
  it("queryKeyInit with tag-only Set query params of other members gives other keys", () => {
    expect(hashOf({ params: { query: { sel: new TaggedSelection("1") } } })).not.toBe(
      hashOf({ params: { query: { sel: new TaggedSelection("2") } } }),
    );
  });

  it("queryKeyInit with a tag-only Set in a body keys its own members", () => {
    expect(queryKeyInit({ body: { sel: new TaggedSelection("1") } }, NO_BASE_URL)).toEqual({
      body: { sel: { ids: "1" } },
    });
  });

  it("queryKeyInit with iterable tag-only Sets without toJSON keys their own members", () => {
    expect(hashOf({ body: new IterableSelection("1") })).not.toBe(
      hashOf({ body: new IterableSelection("2") }),
    );
  });

  it("queryKeyInit with a tag-only Set with a toJSON and no iterator keys its members", () => {
    const sel = Object.assign(new TaggedSelection("1"), { toJSON: (): string => TAG });

    expect(queryKeyInit({ params: { query: { sel } } }, NO_BASE_URL)).toEqual({
      params: { query: { sel: { ids: "1", "toJSON()": TAG } } },
    });
  });

  it("queryKeyInit with an iterable with a toJSON and no collection tag keys its members", () => {
    const list = { ids: "1", toJSON: (): string => TAG, *[Symbol.iterator]() {} };

    expect(queryKeyInit({ params: { query: { list } } }, NO_BASE_URL)).toEqual({
      params: { query: { list: { ids: "1", "toJSON()": TAG } } },
    });
  });

  it("queryKeyInit with an object of the Map prototype and no slots keys its own members", () => {
    const fake = Object.assign(Object.create(Map.prototype) as object, { label: "a" });

    expect(queryKeyInit({ body: { fake } }, NO_BASE_URL)).toEqual({
      body: { fake: { label: "a" } },
    });
  });
});

describe("queryKeyInit a Map or a Set of another realm", () => {
  it("queryKeyInit with Maps of another realm and other own members gives other keys", () => {
    const labeled = (label: string): object =>
      inOtherRealm(`const m = new Map([["a", 1]]); m.label = "${label}"; m`);

    expect(hashOf({ body: { m: labeled("x") } })).not.toBe(hashOf({ body: { m: labeled("y") } }));
  });

  it("queryKeyInit with a Set of another realm keys its own members and values", () => {
    const set = inOtherRealm(`const s = new Set(["${TAG}"]); s.label = "x"; s`);

    expect(queryKeyInit({ params: { query: { set } } }, NO_BASE_URL)).toEqual({
      params: { query: { set: { label: "x", "values()": [TAG] } } },
    });
  });

  it("queryKeyInit with a Map whose type tag says Set keeps its entries", () => {
    const map = new Map([[TAG, 1]]);
    Object.defineProperty(map, Symbol.toStringTag, { value: "Set" });

    expect(queryKeyInit({ body: { map } }, NO_BASE_URL)).toEqual({
      body: { map: { "entries()": [[TAG, 1]] } },
    });
  });

  it("queryKeyInit with a Set whose type tag says Map keeps its values", () => {
    const set = new Set([TAG]);
    Object.defineProperty(set, Symbol.toStringTag, { value: "Map" });

    expect(queryKeyInit({ body: { set } }, NO_BASE_URL)).toEqual({
      body: { set: { "values()": [TAG] } },
    });
  });
});
