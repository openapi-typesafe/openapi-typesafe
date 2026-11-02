import fs from "node:fs";
import { pathToFileURL } from "node:url";
import colors from "ansi-colors";
import { createNodeFileSystem } from "../adapters/node-file-system/node-file-system.js";
import { createRedoclyConfigSource } from "../adapters/redocly-loader/redocly-config-source.js";
import { astToString } from "../api/ast-to-string.js";
import { COMMENT_HEADER } from "../api/comment-header.js";
import { defaultLogger, monotonicNow, terminalSupportsColor } from "../api/default-ports.js";
import openapiTS from "../api/openapi-ts.js";
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

const generateTypes: GenerateTypes = async (source, options) =>
  `${COMMENT_HEADER}${astToString(await openapiTS(source, options))}`;

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
    writeStdout: (text) => process.stdout.write(text),
    stdin: () => process.stdin,
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
