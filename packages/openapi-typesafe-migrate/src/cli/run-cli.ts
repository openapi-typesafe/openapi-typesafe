import { migrateProject } from "../application/migrate-project.js";
import type {
  CallbackRewriter,
  Logger,
  ProjectFiles,
  SourceStringScanner,
} from "../application/ports.js";
import { renderReport } from "../application/report.js";
import { type CliRequest, parseCliArguments } from "./cli-arguments.js";
import { HELP_TEXT, logNote, usageError } from "./cli-text.js";

/** Everything the command takes from the process, so tests run it with fakes. */
export interface CliDependencies {
  readonly version: string;
  readonly cwd: string;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
  readonly createFiles: (root: string, logger: Logger) => ProjectFiles;
  readonly createLogger: (path: string | undefined) => {
    readonly logger: Logger;
    readonly path: string;
  };
  readonly rewriter: CallbackRewriter;
  readonly scanner: SourceStringScanner;
  readonly resolvePath: (cwd: string, path: string) => string;
}

export const EXIT_CODES = { success: 0, failure: 1, usage: 2 } as const;

function parseRequest(
  argv: readonly string[],
  dependencies: CliDependencies,
): CliRequest | undefined {
  try {
    return parseCliArguments(argv);
  } catch (error) {
    // parseArgs reports unknown options and stray positionals as a TypeError.
    if (error instanceof TypeError) {
      dependencies.writeStderr(usageError(error.message));
      return undefined;
    }
    throw error;
  }
}

async function runMigration(
  request: Extract<CliRequest, { kind: "migrate" }>,
  dependencies: CliDependencies,
): Promise<number> {
  const root = dependencies.resolvePath(dependencies.cwd, request.root ?? ".");
  const { logger, path } = dependencies.createLogger(request.logPath);
  try {
    const files = dependencies.createFiles(root, logger);
    const { rewriter, scanner } = dependencies;
    const input = { version: dependencies.version, isWrite: request.isWrite };
    const migration = await migrateProject({ files, rewriter, scanner, logger }, input);
    dependencies.writeStdout(renderReport(migration, request.isWrite));
    return EXIT_CODES.success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("migration_failed", { root, message });
    dependencies.writeStderr(`${message}\n`);
    return EXIT_CODES.failure;
  } finally {
    dependencies.writeStdout(logNote(path));
  }
}

/** Run the command; resolves to the exit code. */
export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  const request = parseRequest(argv, dependencies);
  if (request === undefined) {
    return EXIT_CODES.usage;
  }
  if (request.kind === "help") {
    dependencies.writeStdout(HELP_TEXT);
    return EXIT_CODES.success;
  }
  if (request.kind === "version") {
    dependencies.writeStdout(`${dependencies.version}\n`);
    return EXIT_CODES.success;
  }
  return runMigration(request, dependencies);
}
