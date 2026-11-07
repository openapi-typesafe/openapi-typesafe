import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createGitFileList } from "../adapters/git-file-list/git-file-list.js";
import {
  createJsonLinesLogger,
  createTemporaryLogPath,
} from "../adapters/json-lines-logger/json-lines-logger.js";
import { createNodeProjectFiles } from "../adapters/node-project-files/node-project-files.js";
import { createTypescriptCallbackRewriter } from "../adapters/typescript-parser/rewriter.js";
import { createTypescriptStringScanner } from "../adapters/typescript-parser/source-strings.js";
import { type CliDependencies, runCli } from "./run-cli.js";

/**
 * The composition root: the only module that touches the process. `bin/migrate.js` imports the
 * built copy of this module.
 */

/** The same path from `src/cli/` and from the built `dist/cli/`. */
const PACKAGE_JSON = new URL("../../package.json", import.meta.url);

function readVersion(): string {
  const packageJson: { version: string } = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  return packageJson.version;
}

const now = (): Date => new Date();

/**
 * Without `--log`, a new file per run in a new private folder in the temporary directory, named
 * by its UTC start time. A `--log` file is the user's choice and gets the lines appended.
 */
function createLogger(path: string | undefined): ReturnType<CliDependencies["createLogger"]> {
  const isExclusive = path === undefined;
  const logPath = isExclusive ? createTemporaryLogPath(tmpdir(), now()) : resolve(path);
  return { logger: createJsonLinesLogger({ path: logPath, now, isExclusive }), path: logPath };
}

const dependencies: CliDependencies = {
  version: readVersion(),
  cwd: process.cwd(),
  writeStdout: (text) => process.stdout.write(text),
  writeStderr: (text) => process.stderr.write(text),
  createFiles: (root, logger) => createNodeProjectFiles(root, { git: createGitFileList(), logger }),
  createLogger,
  rewriter: createTypescriptCallbackRewriter(),
  scanner: createTypescriptStringScanner(),
  resolvePath: resolve,
};

runCli(process.argv.slice(2), dependencies).then((exitCode) => {
  process.exitCode = exitCode;
});
