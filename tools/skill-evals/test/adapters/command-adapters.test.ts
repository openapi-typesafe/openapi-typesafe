import { describe, expect, it } from "vitest";
import { CommandCodingAgent } from "../../src/adapters/command-coding-agent.ts";
import { NodeProjectChecks } from "../../src/adapters/node-project-checks.ts";
import { RecordingProcessRunner } from "../fakes/recording-process-runner.ts";
import { GET_PET } from "../fakes/tasks.ts";

const AGENT = { command: ["agent", "-p"], passedVariables: ["AGENT_KEY"] };
const TIMEOUT_MS = 5_000;

function agentWith(outcome: ConstructorParameters<typeof RecordingProcessRunner>[0]) {
  const runner = new RecordingProcessRunner(outcome);
  const agent = new CommandCodingAgent({
    agent: AGENT,
    runner,
    timeoutMs: TIMEOUT_MS,
    transcriptDir: "/logs/run",
  });
  return { runner, agent };
}

describe("CommandCodingAgent", () => {
  it("solve runs the agent in the workspace with the prompt on standard input", async () => {
    const { runner, agent } = agentWith({ exitCode: 0, isTimedOut: false, outputTail: "done" });

    const outcome = await agent.solve({ task: GET_PET, directory: "/work/a", prompt: "Do it." });

    expect(outcome).toEqual({ isCompleted: true, output: "done" });
    expect(runner.runs).toEqual([
      {
        command: ["agent", "-p"],
        cwd: "/work/a",
        timeoutMs: TIMEOUT_MS,
        input: "Do it.",
        logPath: `/logs/run/${GET_PET.id}.log`,
        passedVariables: ["AGENT_KEY"],
      },
    ]);
  });

  it("solve reports a non-zero exit as not completed", async () => {
    const { agent } = agentWith({ exitCode: 1, isTimedOut: false, outputTail: "rate limited" });

    expect(await agent.solve({ task: GET_PET, directory: "/w", prompt: "" })).toEqual({
      isCompleted: false,
      output: "rate limited",
    });
  });

  it("solve notes a timeout in the output", async () => {
    const { agent } = agentWith({ exitCode: null, isTimedOut: true, outputTail: "working" });

    const outcome = await agent.solve({ task: GET_PET, directory: "/w", prompt: "" });

    expect(outcome.isCompleted).toBe(false);
    expect(outcome.output).toBe(`working\n(agent timed out after ${TIMEOUT_MS} ms)`);
  });
});

describe("NodeProjectChecks", () => {
  function checksWith(outcome: ConstructorParameters<typeof RecordingProcessRunner>[0]) {
    const runner = new RecordingProcessRunner(outcome);
    const checks = new NodeProjectChecks({
      runner,
      typescriptCli: "/tsc",
      vitestCli: "/vitest.mjs",
      timeoutMs: TIMEOUT_MS,
    });
    return { runner, checks };
  }

  it("typecheck runs tsc --noEmit on the workspace tsconfig with the current Node.js", async () => {
    const { runner, checks } = checksWith({ exitCode: 0, isTimedOut: false, outputTail: "" });

    expect(await checks.typecheck("/work/a")).toEqual({ isPassed: true, output: "" });
    expect(runner.runs[0]).toEqual({
      command: [process.execPath, "/tsc", "--noEmit", "-p", "tsconfig.json"],
      cwd: "/work/a",
      timeoutMs: TIMEOUT_MS,
    });
  });

  it("test runs vitest run and fails on a non-zero exit", async () => {
    const { runner, checks } = checksWith({
      exitCode: 1,
      isTimedOut: false,
      outputTail: "1 failed",
    });

    expect(await checks.test("/work/a")).toEqual({ isPassed: false, output: "1 failed" });
    expect(runner.runs[0]?.command).toEqual([process.execPath, "/vitest.mjs", "run"]);
  });

  it("a timed-out check fails", async () => {
    const { checks } = checksWith({ exitCode: 0, isTimedOut: true, outputTail: "" });

    expect((await checks.test("/work/a")).isPassed).toBe(false);
  });
});
