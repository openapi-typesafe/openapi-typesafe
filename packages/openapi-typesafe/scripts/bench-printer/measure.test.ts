import { describe, expect, it } from "vitest";
import { measure } from "./measure.js";

/** A clock that advances by the given steps, one per call. */
function steppingClock(steps: readonly number[]): () => number {
  let time = 0;
  let call = 0;
  return () => {
    time += steps[call++ % steps.length] as number;
    return time;
  };
}

describe("measure", () => {
  it("measure runs one warm-up plus the iterations and reports the median", () => {
    let runs = 0;
    const now = steppingClock([0, 5, 0, 1, 0, 9]);

    const timing = measure(() => runs++, { iterations: 3, now });

    expect(runs).toBe(4);
    expect(timing).toEqual({ samplesMs: [5, 1, 9], medianMs: 5 });
  });

  it("measure with an even number of samples averages the middle two", () => {
    const now = steppingClock([0, 2, 0, 4]);

    expect(measure(() => undefined, { iterations: 2, now }).medianMs).toBe(3);
  });

  it.each([0, 1.5, Number.NaN])("measure with iterations %d throws RangeError", (iterations) => {
    expect(() => measure(() => undefined, { iterations, now: () => 0 })).toThrow(RangeError);
  });
});
