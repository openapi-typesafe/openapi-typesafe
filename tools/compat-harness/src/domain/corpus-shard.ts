import { HarnessError, HarnessErrorCode } from "./errors.ts";

/**
 * One slice of the selected corpus entries for a parallel CI job (ADR-038). Shard `index` of
 * `count` takes every `count`-th entry, starting at entry `index - 1`. Taking every n-th entry
 * instead of a block spreads neighbouring entries (the many versions of one large API) over the
 * shards, so the shards take about the same time.
 */
export interface CorpusShard {
  /** From 1 to `count`. */
  readonly index: number;
  readonly count: number;
}

const SHARD_PATTERN = /^([1-9][0-9]*)\/([1-9][0-9]*)$/;

/** Parse `<index>/<count>`, for example `3/16`; undefined when the text is not a valid shard. */
export function parseCorpusShard(text: string): CorpusShard | undefined {
  const match = SHARD_PATTERN.exec(text);
  if (match === null) {
    return undefined;
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  return index <= count ? { index, count } : undefined;
}

/** The items of one shard, in their input order. */
export function selectShard<Item>(items: readonly Item[], shard: CorpusShard): Item[] {
  return items.filter((_, position) => position % shard.count === shard.index - 1);
}

/** A stored case of a sharded command: one entry with one option set. */
export interface ShardCase {
  readonly optionSetId: string;
  readonly entryId: string;
}

const caseKey = (shardCase: ShardCase): string => `${shardCase.optionSetId}/${shardCase.entryId}`;

/** Option set ids in the order they first appear, shard 1 first. */
function optionSetOrder(shards: readonly (readonly ShardCase[])[]): string[] {
  const ids = new Set<string>();
  for (const shardCases of shards) {
    for (const shardCase of shardCases) {
      ids.add(shardCase.optionSetId);
    }
  }
  return [...ids];
}

/**
 * Every-n-th selection gives shard 1 the most entries and each later shard the same number or one
 * less. Any other shape means a shard lost cases, which would otherwise merge without a trace.
 */
function assertShardSizes(optionSetId: string, groups: readonly (readonly ShardCase[])[]): void {
  const sizes = groups.map((group) => group.length);
  const descending = [...sizes].sort((left, right) => right - left);
  const isConsistent =
    sizes.join(",") === descending.join(",") && Math.max(...sizes) - Math.min(...sizes) <= 1;
  if (!isConsistent) {
    const counts = sizes.join(", ");
    const message = `Shards have inconsistent case counts for option set "${optionSetId}": ${counts}`;
    throw new HarnessError(HarnessErrorCode.ShardsInvalid, message);
  }
}

/** Take one case of each shard in turn, which restores the order of the unsharded selection. */
function interleave<Case extends ShardCase>(groups: readonly (readonly Case[])[]): Case[] {
  const largest = Math.max(0, ...groups.map((group) => group.length));
  const merged: Case[] = [];
  for (let row = 0; row < largest; row++) {
    for (const group of groups) {
      const shardCase = group[row];
      if (shardCase !== undefined) {
        merged.push(shardCase);
      }
    }
  }
  return merged;
}

function assertNoDuplicates(cases: readonly ShardCase[]): void {
  const seen = new Set<string>();
  for (const shardCase of cases) {
    const key = caseKey(shardCase);
    if (seen.has(key)) {
      throw new HarnessError(
        HarnessErrorCode.ShardsInvalid,
        `Case ${key} is in more than one shard`,
      );
    }
    seen.add(key);
  }
}

/**
 * Merge the stored cases of every shard, ordered by shard index, into the list one unsharded run
 * writes: option set by option set, entries in selection order. Throws SHARDS_INVALID when a case
 * is in two shards or the case counts do not fit one split of the same selection.
 */
export function mergeShardCases<Case extends ShardCase>(
  shards: readonly (readonly Case[])[],
): Case[] {
  const merged = optionSetOrder(shards).flatMap((optionSetId) => {
    const groups = shards.map((shardCases) =>
      shardCases.filter((shardCase) => shardCase.optionSetId === optionSetId),
    );
    assertShardSizes(optionSetId, groups);
    return interleave(groups);
  });
  assertNoDuplicates(merged);
  return merged;
}
