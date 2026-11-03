import type { TypeDifferences, TypeIdentityChecker } from "../../src/application/ports.ts";

const NO_DIFFERENCES: TypeDifferences = { changed: [], added: [] };

/** TypeIdentityChecker that returns scripted differences per candidate path and records its calls. */
export class FakeTypeIdentityChecker implements TypeIdentityChecker {
  readonly calls: { goldenPath: string; candidatePath: string }[] = [];
  readonly #differences: ReadonlyMap<string, TypeDifferences>;

  constructor(differencesByCandidatePath: Readonly<Record<string, Partial<TypeDifferences>>> = {}) {
    this.#differences = new Map(
      Object.entries(differencesByCandidatePath).map(([path, found]) => [
        path,
        { ...NO_DIFFERENCES, ...found },
      ]),
    );
  }

  async findDifferentTypes(goldenPath: string, candidatePath: string): Promise<TypeDifferences> {
    this.calls.push({ goldenPath, candidatePath });
    return this.#differences.get(candidatePath) ?? NO_DIFFERENCES;
  }
}
