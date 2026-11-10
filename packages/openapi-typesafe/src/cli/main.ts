import fs from "node:fs";
import { isatty } from "node:tty";
import { pathToFileURL } from "node:url";
import colors from "ansi-colors";
import { createNodeFileSystem } from "../adapters/node-file-system/node-file-system.js";
import { createPipeSafeWriter } from "../adapters/pipe-safe-writer/pipe-safe-writer.js";
import { createRedoclyConfigSource } from "../adapters/redocly-loader/redocly-config-source.js";
import { astToString } from "../api/ast-to-string.js";
import { COMMENT_HEADER } from "../api/comment-header.js";
import { defaultLogger, monotonicNow, terminalSupportsColor } from "../api/default-ports.js";
import { defaultGeneratorPorts, generateDocument } from "../api/openapi-ts.js";
import { apiLogger } from "./api-logger.js";
import type { CliConsole, CliDependencies, GenerateTypes, TextStyle } from "./cli-dependencies.js";
import { runCli } from "./run-cli.js";

/**
 * The CLI's composition root (ENGINEERING_PLAN 4.5, ADR-012): the only CLI module that touches the
 * process. `bin/cli.js` imports the built copy of this module.
 */

/** The same path from `src/cli/` and from the built `dist/cli/`. */
const PACKAGE_JSON = new URL("../../package.json", import.meta.url);

function readVersion(): string {
  const packageJson: { version: string } = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
  return packageJson.version;
}

function terminalStyle(): TextStyle {
  const palette = colors.create();
  palette.enabled = terminalSupportsColor();
  return {
    bold: (text) => palette.bold(text),
    green: (text) => palette.green(text),
    dim: (text) => palette.dim(text),
  };
}

const STDIN_DESCRIPTOR = 0;

const generateTypes: GenerateTypes = async (source, options, apiName) => {
  const terminalLogger = defaultLogger(options.silent ?? false);
  const logger = apiName === undefined ? terminalLogger : apiLogger(terminalLogger, apiName);
  const ports = await defaultGeneratorPorts(options, logger);
  const { declarations, localFiles } = await generateDocument(source, options, ports);
  return { contents: `${COMMENT_HEADER}${astToString(declarations)}`, localFiles };
};

function terminalConsole(): CliConsole {
  return {
    // biome-ignore lint/suspicious/noConsole: the CLI's own output lines
    info: (text) => console.info(text),
    // biome-ignore lint/suspicious/noConsole: the CLI's own notices
    notice: (text) => console.warn(text),
  };
}

function processDependencies(): CliDependencies {
  const cwd = process.cwd();
  return {
    cwd: pathToFileURL(`${cwd}/`),
    version: readVersion(),
    logger: defaultLogger(false),
    console: terminalConsole(),
    writeStdout: createPipeSafeWriter(process.stdout),
    stdin: () => process.stdin,
    // `isatty` reads the descriptor without opening `process.stdin`, which would keep the
    // process alive.
    isStdinTerminal: () => isatty(STDIN_DESCRIPTOR),
    files: createNodeFileSystem(),
    redoclyConfigs: createRedoclyConfigSource(cwd),
    generate: generateTypes,
    now: monotonicNow,
    style: terminalStyle(),
  };
}

runCli(process.argv.slice(2), processDependencies()).then((exitCode) => {
  process.exitCode = exitCode;
});
