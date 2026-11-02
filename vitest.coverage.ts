import type { CoverageOptions } from "vitest/node";

/** Coverage percentages a package must not fall below. */
export interface CoverageFloor {
  readonly statements: number;
  readonly branches: number;
  readonly functions: number;
  readonly lines: number;
}

/**
 * Shared coverage settings for every package. The floor is the measured baseline rounded down, so coverage can
 * only go up; Phase 7 (task 7.5) raises every floor to at least 90%.
 */
export function createCoverageOptions(floor: CoverageFloor): CoverageOptions {
  return {
    provider: "v8",
    include: ["src/**"],
    reporter: ["text-summary", "json-summary"],
    thresholds: { ...floor },
  };
}
