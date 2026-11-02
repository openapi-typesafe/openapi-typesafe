import type { TypeIdentityChecker } from "../../src/application/ports.ts";

/** TypeIdentityChecker that returns scripted type names per candidate path and records its calls. */
export class FakeTypeIdentityChecker implements TypeIdentityChecker {
  readonly calls: { goldenPath: string; candidatePath: string }[] = [];
  readonly #differences: ReadonlyMap<string, readonly string[]>;

  constructor(differencesByCandidatePath: Readonly<Record<string, readonly string[]>> = {}) {
    this.#differences = new Map(Object.entries(differencesByCandidatePath));
  }

  async findDifferentTypes(goldenPath: string, candidatePath: string): Promise<readonly string[]> {
    this.calls.push({ goldenPath, candidatePath });
    return this.#differences.get(candidatePath) ?? [];
  }
}
