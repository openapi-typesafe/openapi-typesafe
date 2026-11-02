import { HarnessError } from "../domain/errors.ts";
import { COMMANDS } from "./commands.ts";
import { createContainer } from "./container.ts";
import { parseSettings } from "./settings.ts";
import { printError, printLine } from "./terminal.ts";

/** Exit code for invalid arguments, distinct from 1 (the command ran and found problems). */
const USAGE_ERROR_EXIT_CODE = 2;

/**
 * Entry point: `node src/cli/main.ts <command> [options]`. The process exit code is the command's
 * result.
 */
async function main(argv: readonly string[]): Promise<number> {
  let settings: ReturnType<typeof parseSettings>;
  try {
    settings = parseSettings(argv);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    return USAGE_ERROR_EXIT_CODE;
  }
  const container = createContainer(settings);
  container.logger.info("command_started", { command: settings.command, argv: argv.join(" ") });
  printLine(`Log: ${container.logger.path}`);
  try {
    const exitCode = await COMMANDS[settings.command](container);
    container.logger.info("command_finished", { command: settings.command, exitCode });
    return exitCode;
  } catch (error) {
    const code = error instanceof HarnessError ? error.code : "UNEXPECTED";
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    container.logger.error("command_failed", { command: settings.command, code, message });
    printError(`${code}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
