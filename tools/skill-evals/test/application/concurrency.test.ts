import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../src/application/concurrency.ts";

describe("mapWithConcurrency", () => {
  it("keeps the input order and never runs more workers than the limit", async () => {
    let running = 0;
    let peak = 0;
    const worker = async (item: number): Promise<number> => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, (5 - item) * 2));
      running--;
      return item * 10;
    };

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, worker);

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("returns an empty list for no items", async () => {
    expect(await mapWithConcurrency([], 4, async (item: number) => item)).toEqual([]);
  });
});
