import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type KillProcessGroup,
  NodeProcessRunner,
  type ProcessRun,
} from "../../src/adapters/node-process-runner.ts";
import { temporaryDirectoryFactory } from "./temporary-directory.ts";

const createDirectory = temporaryDirectoryFactory();
const NORMAL_TIMEOUT_MS = 10_000;
/** Long enough for Node to start, short enough to keep the test fast. */
const SHORT_TIMEOUT_MS = 1_000;
const OUTPUT_TAIL_LENGTH = 8_192;
const HANG = "setInterval(() => {}, 1000)";

async function runNode(script: string, run: Partial<ProcessRun> = {}, kill?: KillProcessGroup) {
  const runner = new NodeProcessRunner(kill === undefined ? {} : { kill });
  return runner.run({
    cwd: await createDirectory(),
    command: [process.execPath, "-e", script],
    timeoutMs: NORMAL_TIMEOUT_MS,
    ...run,
  });
}

describe("NodeProcessRunner", () => {
  afterEach(() => {
    delete process.env.SKILL_EVALS_TEST_SECRET;
  });

  it("run returns the exit code and both output streams", async () => {
    const outcome = await runNode("console.log('out'); console.error('err'); process.exit(3)");

    expect(outcome).toMatchObject({ exitCode: 3, isTimedOut: false });
    expect(outcome.outputTail).toContain("out\n");
    expect(outcome.outputTail).toContain("err\n");
  });

  it("run writes the input to standard input", async () => {
    const script =
      "let text = ''; process.stdin.on('data', (c) => (text += c)).on('end', () => console.log(text.toUpperCase()))";

    const outcome = await runNode(script, { input: "prompt" });

    expect(outcome.outputTail).toBe("PROMPT\n");
  });

  it("run writes the full output to the log file and keeps only the end in memory", async () => {
    const logPath = join(await createDirectory(), "nested/agent.log");

    const outcome = await runNode("process.stdout.write('a'.repeat(9000) + 'END')", { logPath });

    expect(outcome.outputTail).toHaveLength(OUTPUT_TAIL_LENGTH);
    expect(outcome.outputTail.endsWith("END")).toBe(true);
    expect(await readFile(logPath, "utf8")).toHaveLength(9003);
  });

  it("run withholds other variables unless the run names them", async () => {
    process.env.SKILL_EVALS_TEST_SECRET = "token";
    const script = "console.log(String(process.env.SKILL_EVALS_TEST_SECRET), process.env.CI)";

    const withheld = await runNode(script);
    const passed = await runNode(script, { passedVariables: ["SKILL_EVALS_TEST_SECRET"] });

    expect(withheld.outputTail).toBe("undefined 1\n");
    expect(passed.outputTail).toBe("token 1\n");
  });

  it("run kills a process that runs past the timeout", async () => {
    const outcome = await runNode(HANG, { timeoutMs: SHORT_TIMEOUT_MS });

    expect(outcome).toMatchObject({ exitCode: null, isTimedOut: true });
  });

  it("run records a failed kill in the output", async () => {
    const pids: number[] = [];
    const kill: KillProcessGroup = (pid) => {
      pids.push(pid);
      process.kill(-pid, "SIGKILL");
      throw Object.assign(new Error("not permitted"), { code: "EPERM" });
    };

    const outcome = await runNode(HANG, { timeoutMs: SHORT_TIMEOUT_MS }, kill);

    expect(pids).toHaveLength(1);
    expect(outcome.outputTail).toContain("failed: Error: not permitted");
  });

  it("run ignores a process group that is already gone", async () => {
    const kill: KillProcessGroup = (pid) => {
      process.kill(-pid, "SIGKILL");
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    };

    const outcome = await runNode(HANG, { timeoutMs: SHORT_TIMEOUT_MS }, kill);

    expect(outcome.isTimedOut).toBe(true);
    expect(outcome.outputTail).not.toContain("failed");
  });

  it("run reports a missing executable", async () => {
    const outcome = await new NodeProcessRunner().run({
      cwd: await createDirectory(),
      command: ["skill-evals-no-such-program"],
      timeoutMs: NORMAL_TIMEOUT_MS,
    });

    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.outputTail).toContain("ENOENT");
  });

  it("run rejects an empty command", async () => {
    await expect(
      new NodeProcessRunner().run({ cwd: "/", command: [], timeoutMs: NORMAL_TIMEOUT_MS }),
    ).rejects.toThrow("needs an executable");
  });
});
