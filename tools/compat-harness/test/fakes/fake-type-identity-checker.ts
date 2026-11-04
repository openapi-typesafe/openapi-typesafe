import type { TypeDifferences, TypeIdentityChecker } from "../../src/application/ports.ts";
import { HarnessError, HarnessErrorCode } from "../../src/domain/errors.ts";

const NO_DIFFERENCES: TypeDifferences = { changed: [], added: [] };

/** TypeIdentityChecker that returns scripted differences per candidate path and records its calls. */
export class FakeTypeIdentityChecker implements TypeIdentityChecker {
  readonly calls: { goldenPath: string; candidatePath: string }[] = [];
  readonly #differences: ReadonlyMap<string, TypeDifferences>;
  readonly #stoppedCandidatePaths: ReadonlySet<string>;

  /** `stoppedCandidatePaths`: candidates whose check TypeScript cannot finish (CHECKER_LIMIT). */
  constructor(
    differencesByCandidatePath: Readonly<Record<string, Partial<TypeDifferences>>> = {},
    stoppedCandidatePaths: readonly string[] = [],
  ) {
    this.#stoppedCandidatePaths = new Set(stoppedCandidatePaths);
    this.#differences = new Map(
      Object.entries(differencesByCandidatePath).map(([path, found]) => [
        path,
        { ...NO_DIFFERENCES, ...found },
      ]),
    );
  }

  async findDifferentTypes(goldenPath: string, candidatePath: string): Promise<TypeDifferences> {
    this.calls.push({ goldenPath, candidatePath });
    if (this.#stoppedCandidatePaths.has(candidatePath)) {
      throw new HarnessError(
        HarnessErrorCode.CheckerLimit,
        `TypeScript stopped on ${candidatePath}`,
      );
    }
    return this.#differences.get(candidatePath) ?? NO_DIFFERENCES;
  }
}
