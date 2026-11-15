import { describe, expect, it } from "vitest";
import {
  compareRanks,
  earlierRank,
  WalkRanks,
} from "../../../../src/application/transform/footer/walk-ranks.js";

describe("WalkRanks", () => {
  it("rankOf ranks locations in the order the walk first meets them", () => {
    const ranks = new WalkRanks();

    const first = ranks.rankOf({ walkedAt: "#/a", position: 1 });
    const second = ranks.rankOf({ walkedAt: "#/b" });
    const again = ranks.rankOf({ walkedAt: "#/a", position: 0 });

    expect([first, second, again]).toEqual([
      [0, 1],
      [1, -1],
      [0, 0],
    ]);
  });

  it("rankOf gives no rank to a request the walk did not make", () => {
    const ranks = new WalkRanks();

    expect(ranks.rankOf({ position: 0 })).toBeUndefined();
    expect(ranks.rankOf({ walkedAt: "#/a" })).toEqual([0, -1]);
  });
});

describe("compareRanks", () => {
  it("compareRanks orders by location, then by position", () => {
    expect(compareRanks([0, 5], [1, 0])).toBeLessThan(0);
    expect(compareRanks([1, 0], [1, 1])).toBeLessThan(0);
    expect(compareRanks([1, 1], [1, 1])).toBe(0);
  });

  it("compareRanks puts an unranked owner after every ranked one", () => {
    expect(compareRanks(undefined, [9, 9])).toBeGreaterThan(0);
    expect(compareRanks([9, 9], undefined)).toBeLessThan(0);
    expect(compareRanks(undefined, undefined)).toBe(0);
  });
});

describe("earlierRank", () => {
  it("earlierRank keeps the earlier of two ranks and ignores a missing one", () => {
    expect(earlierRank([1, 1], [1, 0])).toEqual([1, 0]);
    expect(earlierRank([0, 2], [1, 0])).toEqual([0, 2]);
    expect(earlierRank(undefined, [2, 0])).toEqual([2, 0]);
    expect(earlierRank([2, 0], undefined)).toEqual([2, 0]);
  });
});
