import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { FetchHttpClient } from "../adapters/fetch-http-client.ts";
import { JsonLinesFileLogger } from "../adapters/json-lines-file-logger.ts";
import { NodeCommandRunner } from "../adapters/node-command-runner.ts";
import { NodeDirectoryEraser } from "../adapters/node-directory-eraser.ts";
import { NodeFileStore } from "../adapters/node-file-store.ts";
import { NodeHasher } from "../adapters/node-hasher.ts";
import { NodeProjectSwitcher } from "../adapters/node-project-switcher.ts";
import { SystemClock } from "../adapters/system-clock.ts";
import type {
  Clock,
  CommandRunner,
  DirectoryEraser,
  FileStore,
  Hasher,
  HttpClient,
  ProjectSwitcher,
  Sleep,
} from "../application/ports.ts";
import { HARNESS_DEFAULTS, type HarnessSettings } from "./settings.ts";

/**
 * The harness package directory; relative settings paths resolve against it, not against the shell
 * cwd.
 */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Every shared dependency of the commands, built once per process (the composition root). */
export interface HarnessContainer {
  readonly settings: HarnessSettings;
  readonly clock: Clock;
  readonly http: HttpClient;
  readonly hasher: Hasher;
  readonly sleep: Sleep;
  readonly repository: FileStore;
  readonly cache: FileStore;
  /** The openapi-typesafe packages directory of the repository. */
  readonly packages: FileStore;
  /** The dependents work directory, outside the repository. */
  readonly work: FileStore;
  readonly runner: CommandRunner;
  readonly eraser: DirectoryEraser;
  readonly switcher: ProjectSwitcher;
  readonly logger: JsonLinesFileLogger;
  readonly resolvePath: (path: string) => string;
}

/** One log file per run, named by UTC start time and command, so runs never mix. */
function logFileName(clock: Clock, command: string): string {
  const timestamp = clock.now().toISOString().replaceAll(":", "-");
  return `${timestamp}-${command}.jsonl`;
}

export function createContainer(settings: HarnessSettings): HarnessContainer {
  const clock = new SystemClock();
  const resolvePath = (path: string): string => resolve(PACKAGE_ROOT, path);
  return {
    settings,
    clock,
    http: new FetchHttpClient({
      timeoutMs: HARNESS_DEFAULTS.httpTimeoutMs,
      userAgent: HARNESS_DEFAULTS.userAgent,
    }),
    hasher: new NodeHasher(),
    sleep: (milliseconds) => delay(milliseconds),
    repository: new NodeFileStore(PACKAGE_ROOT),
    cache: new NodeFileStore(resolvePath(settings.cacheDir)),
    packages: new NodeFileStore(resolvePath(HARNESS_DEFAULTS.packagesDir)),
    work: new NodeFileStore(
      settings.workDir === undefined
        ? join(tmpdir(), HARNESS_DEFAULTS.dependentsWorkDirName)
        : resolvePath(settings.workDir),
    ),
    runner: new NodeCommandRunner(),
    eraser: new NodeDirectoryEraser(),
    switcher: new NodeProjectSwitcher(),
    logger: new JsonLinesFileLogger(
      join(resolvePath(settings.logDir), logFileName(clock, settings.command)),
      clock,
    ),
    resolvePath,
  };
}
