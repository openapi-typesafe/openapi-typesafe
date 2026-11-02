import { describe, expect, it } from "vitest";
import { withRetry } from "../../src/application/retry.ts";

function recordingSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (milliseconds: number) => void delays.push(milliseconds) };
}

describe("withRetry", () => {
  it("withRetry returns the first success and sleeps with doubling delays before it", async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;

    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          throw new Error("transient");
        }
        return "done";
      },
      { attempts: 4, initialDelayMs: 100 },
      sleep,
    );

    expect(result).toBe("done");
    expect(delays).toEqual([100, 200]);
  });

  it("withRetry rethrows the last error after the last attempt", async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;

    const run = withRetry(
      async () => {
        calls++;
        throw new Error(`failure ${calls}`);
      },
      { attempts: 3, initialDelayMs: 10 },
      sleep,
    );

    await expect(run).rejects.toThrow("failure 3");
    expect(delays).toEqual([10, 20]);
  });
});
