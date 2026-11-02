import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type KillProcessGroup,
  NodeCommandRunner,
} from "../../src/adapters/node-command-runner.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();
const NORMAL_TIMEOUT_MS = 10_000;
/** Long enough for Node to start, short enough to keep the test fast. */
const SHORT_TIMEOUT_MS = 1_000;
const OUTPUT_TAIL_LENGTH = 8_192;

/** Run a Node.js script through the runner. */
async function runNode(
  script: string,
  options: { timeoutMs?: number; logPath?: string; kill?: KillProcessGroup } = {},
) {
  let tick = 0;
  const runner = new NodeCommandRunner({
    now: () => (tick += 10),
    ...(options.kill === undefined ? {} : { kill: options.kill }),
  });
  return runner.run({
    cwd: await createDirectory(),
    command: [process.execPath, "-e", script],
    timeoutMs: options.timeoutMs ?? NORMAL_TIMEOUT_MS,
    ...(options.logPath === undefined ? {} : { logPath: options.logPath }),
  });
}

describe("NodeCommandRunner", () => {
  afterEach(() => {
    delete process.env.HARNESS_TEST_SECRET;
  });

  it("run returns the exit code, both output streams and the duration", async () => {
    const outcome = await runNode("console.log('out'); console.error('err'); process.exit(3)");

    expect(outcome).toMatchObject({ exitCode: 3, isTimedOut: false, durationMs: 10 });
    expect(outcome.outputTail).toContain("out\n");
    expect(outcome.outputTail).toContain("err\n");
  });

  it("run writes the full output to the log file and keeps only the end in memory", async () => {
    const logPath = join(await createDirectory(), "nested/step.log");

    const outcome = await runNode("process.stdout.write('a'.repeat(9000) + 'END')", { logPath });

    expect(outcome.outputTail).toHaveLength(OUTPUT_TAIL_LENGTH);
    expect(outcome.outputTail.endsWith("END")).toBe(true);
    expect(await readFile(logPath, "utf8")).toHaveLength(9003);
  });

  it("run passes a reduced environment without the harness secrets", async () => {
    process.env.HARNESS_TEST_SECRET = "token";

    const outcome = await runNode(
      "const { HARNESS_TEST_SECRET, CI, LANG, TZ } = process.env;" +
        "console.log([HARNESS_TEST_SECRET ?? 'absent', CI, LANG, TZ].join(','))",
    );

    expect(outcome.outputTail.trim()).toBe("absent,1,en_US.UTF-8,UTC");
  });

  it("run kills the whole process group when the timeout passes", async () => {
    const outcome = await runNode(
      [
        "const { spawn } = require('node:child_process');",
        "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
        "console.log(child.pid);",
        "setInterval(() => {}, 1000);",
      ].join(" "),
      { timeoutMs: SHORT_TIMEOUT_MS },
    );

    expect(outcome).toMatchObject({ exitCode: null, isTimedOut: true });
    const grandchild = Number.parseInt(outcome.outputTail, 10);
    expect(() => process.kill(grandchild, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("run writes a failed kill to the output instead of crashing", async () => {
    const realKill: KillProcessGroup = (pid) => process.kill(-pid, "SIGKILL");
    const kill: KillProcessGroup = (pid) => {
      realKill(pid);
      throw Object.assign(new Error("not permitted"), { code: "EPERM" });
    };

    const outcome = await runNode("setInterval(() => {}, 1000)", {
      timeoutMs: SHORT_TIMEOUT_MS,
      kill,
    });

    expect(outcome.isTimedOut).toBe(true);
    expect(outcome.outputTail).toMatch(/Killing process group \d+ failed: Error: not permitted/);
  });

  it("run accepts a process group that exited before the kill", async () => {
    const realKill: KillProcessGroup = (pid) => process.kill(-pid, "SIGKILL");
    const kill: KillProcessGroup = (pid) => {
      realKill(pid);
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    };

    const outcome = await runNode("setInterval(() => {}, 1000)", {
      timeoutMs: SHORT_TIMEOUT_MS,
      kill,
    });

    expect(outcome).toMatchObject({ isTimedOut: true, outputTail: "" });
  });

  it("run of a missing executable reports the spawn error", async () => {
    const runner = new NodeCommandRunner();

    // A zero timeout must not fire: a failed spawn has no process to time out.
    const outcome = await runner.run({
      cwd: await createDirectory(),
      command: ["openapi-typesafe-missing-command"],
      timeoutMs: 0,
    });

    expect(outcome).toMatchObject({ isTimedOut: false });
    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.outputTail).toContain("ENOENT");
  });

  it("run without an executable throws", async () => {
    await expect(
      new NodeCommandRunner().run({ cwd: ".", command: [], timeoutMs: NORMAL_TIMEOUT_MS }),
    ).rejects.toThrow(/needs an executable/);
  });
});
