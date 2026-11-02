import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** One child process: the program and its arguments, run in `cwd`. */
export interface ProcessRun {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  /** Written to standard input, which is then closed; without it stdin is empty. */
  readonly input?: string;
  /** Where the full output goes; only its end is kept in memory. */
  readonly logPath?: string;
  /** Names of further environment variables to pass on, such as an API key. */
  readonly passedVariables?: readonly string[];
}

export interface ProcessOutcome {
  /** `null` when the process was killed. */
  readonly exitCode: number | null;
  readonly isTimedOut: boolean;
  readonly outputTail: string;
}

export interface ProcessRunner {
  run(run: ProcessRun): Promise<ProcessOutcome>;
}

/** Enough output for the error block of a failing compiler, test run or agent. */
const MAX_OUTPUT_TAIL_LENGTH = 8_192;

/** Variables every child gets; the rest (tokens, credentials) only when a run names them. */
const INHERITED_VARIABLES = ["PATH", "HOME", "TMPDIR", "USER", "SHELL"] as const;

/** Plain, non-interactive output in every tool. */
const FIXED_VARIABLES = { CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", TZ: "UTC" } as const;

function childEnvironment(passed: readonly string[]): NodeJS.ProcessEnv {
  const inherited = [...INHERITED_VARIABLES, ...passed].flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value] as const];
  });
  return { ...Object.fromEntries(inherited), ...FIXED_VARIABLES };
}

/** Sends SIGKILL to the process group led by `pid`. */
export type KillProcessGroup = (pid: number) => void;

/**
 * Runs commands in child processes with a reduced environment. Each command gets its own process
 * group, so a timeout kills the whole tree (agents start shells, compilers and test workers).
 */
export class NodeProcessRunner implements ProcessRunner {
  readonly #kill: KillProcessGroup;

  /** `kill` is injected so a failing kill is testable. */
  constructor(options: { readonly kill?: KillProcessGroup } = {}) {
    this.#kill = options.kill ?? ((pid) => process.kill(-pid, "SIGKILL"));
  }

  async run(run: ProcessRun): Promise<ProcessOutcome> {
    const [executable, ...args] = run.command;
    if (executable === undefined) {
      throw new Error("A command needs an executable");
    }
    const log = await openLog(run.logPath);
    const child = spawn(executable, args, {
      cwd: run.cwd,
      env: childEnvironment(run.passedVariables ?? []),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    const output = new OutputRecorder(log);
    child.stdout?.setEncoding("utf8").on("data", output.record);
    child.stderr?.setEncoding("utf8").on("data", output.record);
    // A missing executable emits "error" and then "close" with a negative errno exit code.
    child.on("error", (error) => output.record(`${error.message}\n`));
    // A child that exits before reading its input closes the pipe; that is not an error here.
    child.stdin?.on("error", () => output.record("(standard input closed early)\n"));
    child.stdin?.end(run.input ?? "");
    const exit = await waitForExit(child, run.timeoutMs, (pid) =>
      killGroup(this.#kill, pid, output),
    );
    await closeLog(log);
    return { ...exit, outputTail: output.tail };
  }
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
 * failure is written to the output, because a throw inside the timer would crash the run.
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
