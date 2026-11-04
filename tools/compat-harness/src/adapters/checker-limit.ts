import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";

/**
 * Runs a TypeScript check and turns a `RangeError` into CHECKER_LIMIT. TypeScript throws it when
 * a file outgrows the checker's own limits (its relation cache passes the largest `Map`, the stack
 * overflows); a user's `tsc` stops on that file the same way, so it is a result, not a harness bug.
 */
export function runChecker<T>(path: string, check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (error instanceof RangeError) {
      throw new HarnessError(
        HarnessErrorCode.CheckerLimit,
        `TypeScript stopped on ${path}: ${error.message}`,
      );
    }
    throw error;
  }
}
