import type { OutputCompiler } from "../../src/application/ports.ts";

/** OutputCompiler that returns scripted error counts per path (0 when not scripted). */
export class FakeOutputCompiler implements OutputCompiler {
  readonly #errors: ReadonlyMap<string, number>;

  constructor(errorsByPath: Readonly<Record<string, number>> = {}) {
    this.#errors = new Map(Object.entries(errorsByPath));
  }

  async countErrors(path: string): Promise<number> {
    return this.#errors.get(path) ?? 0;
  }
}
