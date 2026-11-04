import type { OutputCompiler } from "../../src/application/ports.ts";
import { HarnessError, HarnessErrorCode } from "../../src/domain/errors.ts";

/** The scripted result of a file TypeScript stops on. */
export const CHECKER_LIMIT = "checker-limit";

/** OutputCompiler that returns scripted error counts per path (0 when not scripted). */
export class FakeOutputCompiler implements OutputCompiler {
  readonly #errors: ReadonlyMap<string, number | typeof CHECKER_LIMIT>;

  constructor(errorsByPath: Readonly<Record<string, number | typeof CHECKER_LIMIT>> = {}) {
    this.#errors = new Map(Object.entries(errorsByPath));
  }

  async countErrors(path: string): Promise<number> {
    const errors = this.#errors.get(path) ?? 0;
    if (errors === CHECKER_LIMIT) {
      throw new HarnessError(HarnessErrorCode.CheckerLimit, `TypeScript stopped on ${path}`);
    }
    return errors;
  }
}
