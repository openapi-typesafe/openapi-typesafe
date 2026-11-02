import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { CommandOutcome, CommandRun, CommandRunner } from "../application/ports.ts";

/** Enough output for the error block of a failing compiler or test run. */
const MAX_OUTPUT_TAIL_LENGTH = 8_192;

/**
 * Variables passed on from the harness environment. Everything else (tokens, cloud credentials) is
 * withheld, because the commands are third-party project scripts.
 */
const INHERITED_VARIABLES = ["PATH", "HOME", "TMPDIR", "USER"] as const;

/**
 * Plain, non-interactive output in every tool, and the locale and time zone of a typical CI
 * runner, because project tests format dates and times.
 */
const FIXED_VARIABLES = {
  CI: "1",
  NO_COLOR: "1",
  FORCE_COLOR: "0",
  LANG: "en_US.UTF-8",
  TZ: "UTC",
} as const;

function childEnvironment(): NodeJS.ProcessEnv {
  const inherited = INHERITED_VARIABLES.flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value] as const];
  });
  return { ...Object.fromEntries(inherited), ...FIXED_VARIABLES };
}

async function openLog(logPath: string | undefined): Promise<WriteStream | undefined> {
  if (logPath === undefined) {
    return undefined;
  }
  await mkdir(dirname(logPath), { recursive: true });
  return createWriteStream(logPath);
}

/** Flush and close the log, so it is complete when the outcome is returned. */
function closeLog(log: WriteStream | undefined): Promise<void> {
  return new Promise((resolve) => (log === undefined ? resolve() : log.end(resolve)));
}

/**
 * Runs commands in child processes with a reduced environment. Each command gets its own process
 * group, so a timeout kills the whole tree (package managers start compilers and test workers).
 */
export class NodeCommandRunner implements CommandRunner {
  readonly #now: () => number;
  readonly #kill: KillProcessGroup;

  /**
   * `now` is a monotonic millisecond clock and `kill` sends a signal to a process group; both are
   * injected so durations and kill failures are testable.
   */
  constructor(options: { readonly now?: () => number; readonly kill?: KillProcessGroup } = {}) {
    this.#now = options.now ?? (() => performance.now());
    this.#kill = options.kill ?? ((pid) => process.kill(-pid, "SIGKILL"));
  }

  async run(run: CommandRun): Promise<CommandOutcome> {
    const [executable, ...args] = run.command;
    if (executable === undefined) {
      throw new Error("A command needs an executable");
    }
    const log = await openLog(run.logPath);
    const startedAt = this.#now();
    const child = spawn(executable, args, {
      cwd: run.cwd,
      env: childEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const output = new OutputRecorder(log);
    child.stdout.setEncoding("utf8").on("data", output.record);
    child.stderr.setEncoding("utf8").on("data", output.record);
    // A missing executable emits "error" and then "close" with a negative errno exit code.
    child.on("error", (error) => output.record(`${error.message}\n`));
    const { exitCode, isTimedOut } = await waitForExit(child, run.timeoutMs, (pid) =>
      killGroup(this.#kill, pid, output),
    );
    await closeLog(log);
    const durationMs = Math.round(this.#now() - startedAt);
    return { exitCode, isTimedOut, outputTail: output.tail, durationMs };
  }
}

/** Streams output to the log file and keeps its end in memory. */
class OutputRecorder {
  readonly #log: WriteStream | undefined;
  tail = "";

  constructor(log: WriteStream | undefined) {
    this.#log = log;
  }

  readonly record = (chunk: string): void => {
    this.#log?.write(chunk);
    this.tail = (this.tail + chunk).slice(-MAX_OUTPUT_TAIL_LENGTH);
  };
}

/** Sends SIGKILL to the process group led by `pid`. */
export type KillProcessGroup = (pid: number) => void;

/**
 * Resolve on "close"; call `onTimeout` when the process runs longer than the timeout. A failed
 * spawn has no pid and closes right after its "error" event, so it gets no timer.
 */
function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
  onTimeout: (pid: number) => void,
): Promise<{ readonly exitCode: number | null; readonly isTimedOut: boolean }> {
  return new Promise((resolve) => {
    let isTimedOut = false;
    const { pid } = child;
    const timer =
      pid === undefined
        ? undefined
        : setTimeout(() => {
            isTimedOut = true;
            onTimeout(pid);
          }, timeoutMs);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, isTimedOut });
    });
  });
}

/**
 * Kill the process group of a timed-out command. A group that already exited is fine; any other
 * failure is written to the output, because a throw inside the timer would crash the harness.
 */
function killGroup(kill: KillProcessGroup, pid: number, output: OutputRecorder): void {
  try {
    kill(pid);
  } catch (error) {
    const isGone = error instanceof Error && "code" in error && error.code === "ESRCH";
    if (!isGone) {
      output.record(`Killing process group ${pid} failed: ${String(error)}\n`);
    }
  }
}
