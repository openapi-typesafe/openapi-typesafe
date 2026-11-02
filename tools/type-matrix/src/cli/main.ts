import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesFileLogger } from "../adapters/json-lines-file-logger.ts";
import { NodeCompilerRunner } from "../adapters/node-compiler-runner.ts";
import { SystemClock } from "../adapters/system-clock.ts";
import { runMatrix } from "../application/run-matrix.ts";
import {
  type CellResult,
  CONSUMER_PROJECTS,
  hasBlockingFailure,
  matrixCells,
  selectVersions,
  TYPESCRIPT_VERSIONS,
} from "../domain/matrix.ts";
import { COMPILER_TIMEOUT_MS, parseSettings } from "./settings.ts";

/** The package directory; relative paths resolve against it, not against the shell cwd. */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const USAGE_ERROR_EXIT_CODE = 2;

function describeResult(result: CellResult): string {
  const status = result.isPassed ? "pass" : result.cell.version.isBlocking ? "FAIL" : "fail (beta)";
  return `${result.cell.version.id.padEnd(9)} ${result.cell.project.id.padEnd(13)} ${status}`;
}

/** Entry point and composition root: `node src/cli/main.ts [--typescript <id>]...`. */
async function main(argv: readonly string[]): Promise<number> {
  let settings: ReturnType<typeof parseSettings>;
  let versions: ReturnType<typeof selectVersions>;
  try {
    settings = parseSettings(argv);
    versions = selectVersions(TYPESCRIPT_VERSIONS, settings.typescriptIds);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return USAGE_ERROR_EXIT_CODE;
  }
  const clock = new SystemClock();
  const logName = `${clock.now().toISOString().replaceAll(":", "-")}.jsonl`;
  const logger = new JsonLinesFileLogger(
    join(resolve(PACKAGE_ROOT, settings.logDir), logName),
    clock,
  );
  const compiler = new NodeCompilerRunner({
    consumerDir: join(PACKAGE_ROOT, "consumer"),
    timeoutMs: COMPILER_TIMEOUT_MS,
  });
  process.stdout.write(`Log: ${logger.path}\n`);
  const results = await runMatrix({ compiler, logger }, matrixCells(versions, CONSUMER_PROJECTS));
  for (const result of results) {
    process.stdout.write(`${describeResult(result)}\n${result.output}`);
  }
  const isFailed = hasBlockingFailure(results);
  logger.info("matrix_finished", { cells: results.length, isFailed });
  return isFailed ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
