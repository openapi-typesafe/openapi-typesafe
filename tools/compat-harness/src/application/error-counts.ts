import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import type { Logger, OutputCompiler } from "./ports.ts";

/**
 * The error count of a file TypeScript stops on (CHECKER_LIMIT). No count is worse: a user's `tsc`
 * gives no result for it at all. Only compared in memory: JSON cannot store it.
 */
export const CHECKER_STOPPED = Number.POSITIVE_INFINITY;

export function isCheckerLimit(error: unknown): error is HarnessError {
  return error instanceof HarnessError && error.code === HarnessErrorCode.CheckerLimit;
}

/** The file's error count, or CHECKER_STOPPED (logged) when TypeScript cannot finish it. */
export async function countErrorsOrStop(
  compiler: OutputCompiler,
  logger: Logger,
  path: string,
): Promise<number> {
  try {
    return await compiler.countErrors(path);
  } catch (error) {
    if (!isCheckerLimit(error)) {
      throw error;
    }
    logger.warn("checker_limit", { path, message: error.message });
    return CHECKER_STOPPED;
  }
}
