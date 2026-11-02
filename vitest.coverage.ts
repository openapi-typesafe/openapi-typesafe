import type { CoverageOptions } from "vitest/node";

/** Coverage percentages a package must not fall below. */
export interface CoverageFloor {
  readonly statements: number;
  readonly branches: number;
  readonly functions: number;
  readonly lines: number;
}

/**
 * The floor for the `domain/` and `application/` layers of a package that has them
 * (ENGINEERING_PLAN 7.5): they hold the business rules, so each layer must pass on its own and
 * cannot hide behind a well-covered adapter.
 */
export const LAYER_FLOOR: CoverageFloor = { statements: 90, branches: 90, functions: 90, lines: 90 };

/** The source globs of the layered packages that `LAYER_FLOOR` applies to. */
export const LAYER_GLOBS: readonly string[] = ["src/domain/**", "src/application/**"];

/**
 * Shared coverage settings for every package. The floor is the measured coverage rounded down
 * (at least 90%, ENGINEERING_PLAN 7.5), so coverage can only go up. `layerGlobs` get
 * `LAYER_FLOOR` each.
 */
export function createCoverageOptions(floor: CoverageFloor, layerGlobs: readonly string[] = []): CoverageOptions {
  const layerThresholds = Object.fromEntries(layerGlobs.map((glob) => [glob, { ...LAYER_FLOOR }]));
  return {
    provider: "v8",
    include: ["src/**"],
    reporter: ["text-summary", "json-summary"],
    thresholds: { ...floor, ...layerThresholds },
  };
}
