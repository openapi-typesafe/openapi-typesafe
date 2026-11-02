import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../src/application/concurrency.ts";

describe("mapWithConcurrency", () => {
  it("mapWithConcurrency keeps input order and never exceeds the limit", async () => {
    let running = 0;
    let maxRunning = 0;

    const results = await mapWithConcurrency([30, 10, 20, 0, 5], 2, async (delay, index) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running--;
      return `${index}:${delay}`;
    });

    expect(results).toEqual(["0:30", "1:10", "2:20", "3:0", "4:5"]);
    expect(maxRunning).toBe(2);
  });

  it("mapWithConcurrency with no items returns an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
