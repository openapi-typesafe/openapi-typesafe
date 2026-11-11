import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createGitFileList } from "../adapters/git-file-list/git-file-list.js";
import { createNodeGitFileSystem } from "../adapters/git-file-list/git-locations.js";
import {
  createJsonLinesLogger,
  createTemporaryLogPath,
} from "../adapters/json-lines-logger/json-lines-logger.js";
import { createJsonTextReader } from "../adapters/json-text/json-text.js";
import {
  createNodeProjectFiles,
  inspectProjectRoot,
} from "../adapters/node-project-files/node-project-files.js";
import { createPipeSafeWriter } from "../adapters/pipe-safe-writer/pipe-safe-writer.js";
import { createTypescriptCallbackRewriter } from "../adapters/typescript-parser/rewriter.js";
import { createTypescriptStringScanner } from "../adapters/typescript-parser/source-strings.js";
import { createYamlTextReader } from "../adapters/yaml-text/yaml-text.js";
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

/** Git for the project at `root`: git is looked up on PATH outside that folder. */
const createGit = (root: string) =>
  createGitFileList({
    environment: process.env,
    platform: process.platform,
    fileSystem: createNodeGitFileSystem(),
    projectRoot: root,
  });

const dependencies: CliDependencies = {
  version: readVersion(),
  cwd: process.cwd(),
  writeStdout: createPipeSafeWriter(process.stdout),
  writeStderr: createPipeSafeWriter(process.stderr),
  inspectRoot: inspectProjectRoot,
  createFiles: (root, logger) => createNodeProjectFiles(root, { git: createGit(root), logger }),
  createLogger,
  rewriter: createTypescriptCallbackRewriter(),
  scanner: createTypescriptStringScanner(),
  readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
  resolvePath: resolve,
};

runCli(process.argv.slice(2), dependencies).then((exitCode) => {
  process.exitCode = exitCode;
});
