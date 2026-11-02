/** Wall-clock samples of one benchmarked operation, in milliseconds. */
export interface Timing {
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
}

/** Benchmark parameters; `now` is the clock, so tests and runs can choose their own. */
export interface MeasureOptions {
  readonly iterations: number;
  readonly now: () => number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] as number;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] as number) + upper) / 2;
}

/**
 * Run `operation` once to warm up the JIT, then `iterations` more times, and report the median.
 * The median is used because single runs of large files are disturbed by garbage collection.
 */
export function measure(operation: () => unknown, options: MeasureOptions): Timing {
  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, got ${options.iterations}`);
  }
  operation();
  const samplesMs: number[] = [];
  for (let run = 0; run < options.iterations; run++) {
    const start = options.now();
    operation();
    samplesMs.push(options.now() - start);
  }
  return { samplesMs, medianMs: median(samplesMs) };
}
