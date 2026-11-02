import type { CellResult, MatrixCell } from "../domain/matrix.ts";
import type { CompilerRunner, Logger } from "./ports.ts";

export interface RunMatrixDependencies {
  readonly compiler: CompilerRunner;
  readonly logger: Logger;
}

/** The compiler output kept in the log: enough for the first errors, bounded for large failures. */
const MAX_LOGGED_OUTPUT_LENGTH = 4_000;

/** Type-check every cell one after another; compilers are memory-heavy, so they do not overlap. */
export async function runMatrix(
  dependencies: RunMatrixDependencies,
  cells: readonly MatrixCell[],
): Promise<readonly CellResult[]> {
  const results: CellResult[] = [];
  for (const cell of cells) {
    results.push(await checkCell(dependencies, cell));
  }
  return results;
}

async function checkCell(
  { compiler, logger }: RunMatrixDependencies,
  cell: MatrixCell,
): Promise<CellResult> {
  const outcome = await compiler.run({
    packageName: cell.version.packageName,
    tsconfig: cell.project.tsconfig,
  });
  const isPassed = outcome.exitCode === 0;
  const fields = {
    typescript: cell.version.id,
    project: cell.project.id,
    isBlocking: cell.version.isBlocking,
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
  };
  if (isPassed) {
    logger.info("check_passed", fields);
  } else {
    logger.error("check_failed", {
      ...fields,
      output: outcome.output.slice(0, MAX_LOGGED_OUTPUT_LENGTH),
    });
  }
  return { cell, isPassed, output: isPassed ? "" : outcome.output, durationMs: outcome.durationMs };
}
