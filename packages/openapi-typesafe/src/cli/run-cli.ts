import type { Logger } from "../application/ports/logger.js";
import type { RedoclyConfig } from "../application/ports/redocly-config-source.js";
import type { SchemaSource } from "../types.js";
import { ineffectiveFlagNotices, parseCliArguments } from "./cli-arguments.js";
import type { CliDependencies } from "./cli-dependencies.js";
import { cliError, describeCliFailure, EXIT_CODES, type ExitCode } from "./cli-errors.js";
import { type CliRun, emitOutput, resolveLocationUrl } from "./cli-output.js";
import { MULTIPLE_SCHEMAS_DOCS_URL } from "./docs-links.js";
import { fixOption } from "./fix-option.js";
import { HELP_TEXT } from "./help-text.js";
import { generateRedoclyApis, hasRedoclyApis } from "./redocly-apis.js";
import { refLimitOptions } from "./ref-limits.js";

/**
 * The CLI's use case: parse the arguments, then generate the APIs of the Redocly config, one
 * schema file or URL, or stdin. It has no process access of its own; `main.ts` wires it (ADR-012).
 */

async function loadRedoclyConfig(run: CliRun): Promise<RedoclyConfig> {
  const { redoclyConfigs } = run.deps;
  const explicitPath = run.args.redocly;
  const configPath = redoclyConfigs.find(explicitPath);
  if (explicitPath && !configPath) {
    throw cliError("CLI_CONFIG_NOT_FOUND", `Redocly config not found at: ${explicitPath}`);
  }
  return configPath ? redoclyConfigs.load(configPath) : redoclyConfigs.createDefault();
}

/** The schema's URL, or stdin when no path or URL is given and something is piped in. */
function schemaSource(run: CliRun): SchemaSource {
  const { input } = run.args;
  if (input) {
    return resolveLocationUrl(input, run.deps.cwd);
  }
  if (run.deps.isStdinTerminal()) {
    throw cliError(
      "CLI_INPUT_MISSING",
      "No schema given: pass a schema path or URL, pipe a schema into stdin, or define `apis` " +
        "in redocly.yaml. See --help.",
    );
  }
  return run.deps.stdin();
}

/** One schema from a path, a URL or stdin; without `--output`, the types go to stdout only. */
async function generateSingleSchema(run: CliRun, redocly: RedoclyConfig): Promise<void> {
  const { input, output } = run.args;
  if (input?.includes("*")) {
    throw cliError(
      "CLI_GLOB_UNSUPPORTED",
      "Globbing has been deprecated in favor of redocly.yaml’s `apis` keys. " +
        `See ${MULTIPLE_SCHEMAS_DOCS_URL}`,
    );
  }
  if (run.args.isCheck && !output) {
    // Without a file there is nothing to compare: the original printed the types and passed.
    throw cliError(
      "CLI_CHECK_OUTPUT_MISSING",
      "--check needs the generated file to compare with: add --output <file>.",
    );
  }
  const source = schemaSource(run);
  const options = {
    ...run.args.generatorFlags,
    ...refLimitOptions(run.args, run.deps.cwd),
    ...fixOption(run.args.fix),
    redocly,
    silent: !output,
  };
  const contents = await run.deps.generate(source, options);
  if (!output) {
    run.deps.writeStdout(contents);
    return;
  }
  const file = resolveLocationUrl(output, run.deps.cwd);
  emitOutput(run, { source: input ?? "stdin", output, file }, contents);
}

async function generate(run: CliRun): Promise<unknown[]> {
  const redocly = await loadRedoclyConfig(run);
  if (!hasRedoclyApis(redocly)) {
    await generateSingleSchema(run, redocly);
    return [];
  }
  if (run.args.input) {
    run.deps.logger.warn(
      "APIs are specified both in Redocly Config and CLI argument. Only using Redocly config.",
    );
  }
  return generateRedoclyApis(run, redocly);
}

/** Run the command; the failures it returns did not stop the other outputs. */
async function runCommand(argv: readonly string[], deps: CliDependencies): Promise<unknown[]> {
  const startedAt = deps.now();
  for (const notice of ineffectiveFlagNotices(argv)) {
    deps.console.notice(notice);
  }
  const args = parseCliArguments(argv);
  for (const flag of args.unknownFlags) {
    deps.console.notice(`Unknown flag ${flag} is ignored (see --help)`);
  }
  if (args.isHelp || args.isVersion) {
    deps.console.info(args.isHelp ? HELP_TEXT : `v${deps.version}`);
    return [];
  }
  if (args.output) {
    deps.console.info(`✨ ${deps.style.bold(`openapi-typesafe ${deps.version}`)}`);
  }
  return generate({ deps, args, startedAt });
}

/** Print one line per failure; the exit code is the first failure's (ADR-011). */
function reportFailures(failures: readonly unknown[], logger: Logger): ExitCode {
  const reports = failures.map(describeCliFailure);
  for (const report of reports) {
    logger.error(report.message);
  }
  return reports[0]?.exitCode ?? EXIT_CODES.SUCCESS;
}

/** Run the CLI with the arguments after `node cli.js`, and return the process exit code. */
export async function runCli(argv: readonly string[], deps: CliDependencies): Promise<ExitCode> {
  let failures: unknown[];
  try {
    failures = await runCommand(argv, deps);
  } catch (thrown) {
    failures = [thrown];
  }
  return reportFailures(failures, deps.logger);
}
