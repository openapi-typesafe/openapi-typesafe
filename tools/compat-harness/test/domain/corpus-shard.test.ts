import { describe, expect, it } from "vitest";
import {
  type CorpusShard,
  mergeShardCases,
  parseCorpusShard,
  type ShardCase,
  selectShard,
} from "../../src/domain/corpus-shard.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";

const shardsError = expect.objectContaining({ code: HarnessErrorCode.ShardsInvalid });

/** The cases one unsharded run stores: option set by option set, entries in selection order. */
function casesOf(optionSetIds: readonly string[], entryIds: readonly string[]): ShardCase[] {
  return optionSetIds.flatMap((optionSetId) =>
    entryIds.map((entryId) => ({ optionSetId, entryId })),
  );
}

function shardsOf(count: number): CorpusShard[] {
  return Array.from({ length: count }, (_, position) => ({ index: position + 1, count }));
}

describe("parseCorpusShard", () => {
  it("parseCorpusShard reads <index>/<count>", () => {
    expect(parseCorpusShard("3/16")).toEqual({ index: 3, count: 16 });
    expect(parseCorpusShard("1/1")).toEqual({ index: 1, count: 1 });
  });

  it.each(["0/4", "5/4", "1/0", "1", "a/b", "1/2/3", " 1/2", "01/2"])(
    "parseCorpusShard with %s returns undefined",
    (text) => {
      expect(parseCorpusShard(text)).toBeUndefined();
    },
  );
});

describe("selectShard", () => {
  it("selectShard takes every count-th item starting at index - 1", () => {
    const items = ["a", "b", "c", "d", "e"];

    expect(shardsOf(2).map((shard) => selectShard(items, shard))).toEqual([
      ["a", "c", "e"],
      ["b", "d"],
    ]);
  });

  it("selectShard gives every item to exactly one shard", () => {
    const items = Array.from({ length: 23 }, (_, position) => `entry-${position}`);

    const selected = shardsOf(5).flatMap((shard) => selectShard(items, shard));

    expect([...selected].sort()).toEqual([...items].sort());
  });

  it("selectShard with more shards than items leaves the last shards empty", () => {
    expect(shardsOf(4).map((shard) => selectShard(["a", "b"], shard))).toEqual([
      ["a"],
      ["b"],
      [],
      [],
    ]);
  });
});

describe("mergeShardCases", () => {
  it.each([1, 2, 3, 7, 12])(
    "mergeShardCases of %i shards restores the unsharded order",
    (count) => {
      const entryIds = Array.from({ length: 10 }, (_, position) => `entry-${position}`);
      const expected = casesOf(["default", "enum", "immutable"], entryIds);
      const shards = shardsOf(count).map((shard) =>
        casesOf(["default", "enum", "immutable"], selectShard(entryIds, shard)),
      );

      expect(mergeShardCases(shards)).toEqual(expected);
    },
  );

  it("mergeShardCases keeps the other fields of each case", () => {
    const first = { optionSetId: "default", entryId: "a", status: "ok" };
    const second = { optionSetId: "default", entryId: "b", status: "failed" };

    expect(mergeShardCases([[first], [second]])).toEqual([first, second]);
  });

  it("mergeShardCases of empty shards is empty", () => {
    expect(mergeShardCases([[], []])).toEqual([]);
  });

  it("mergeShardCases with a case in two shards throws SHARDS_INVALID", () => {
    const shards = [casesOf(["default"], ["a"]), casesOf(["default"], ["a"])];

    expect(() => mergeShardCases(shards)).toThrow(shardsError);
  });

  it("mergeShardCases with a later shard larger than an earlier one throws SHARDS_INVALID", () => {
    const shards = [casesOf(["default"], ["a"]), casesOf(["default"], ["b", "d"])];

    expect(() => mergeShardCases(shards)).toThrow(shardsError);
  });

  it("mergeShardCases with a shard two cases short throws SHARDS_INVALID", () => {
    const shards = [casesOf(["default"], ["a", "c", "e"]), casesOf(["default"], ["b"])];

    expect(() => mergeShardCases(shards)).toThrow(/inconsistent case counts.*"default": 3, 1/);
  });
});
