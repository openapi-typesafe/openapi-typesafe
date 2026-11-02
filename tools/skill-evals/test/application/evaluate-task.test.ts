import { describe, expect, it } from "vitest";
import {
  type EvaluationDependencies,
  type EvaluationOptions,
  evaluateTask,
} from "../../src/application/evaluate-task.ts";
import type { CodingAgent } from "../../src/application/ports.ts";
import { TaskOutcome } from "../../src/domain/task-result.ts";
import { InMemoryWorkspaces } from "../fakes/in-memory-workspaces.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";
import { ScriptedAgent, ThrowingAgent } from "../fakes/scripted-agent.ts";
import { ScriptedChecks } from "../fakes/scripted-checks.ts";
import { SteppingClock } from "../fakes/stepping-clock.ts";
import { GET_PET } from "../fakes/tasks.ts";

const OPTIONS: EvaluationOptions = { runLabel: "test", concurrency: 1, isKeepingWorkspaces: false };
const DIRECTORY = `/work/${GET_PET.id}`;
const CLOCK_STEP_MS = 250;

function setUp(agent: CodingAgent = new ScriptedAgent(), checks = new ScriptedChecks()) {
  const dependencies = {
    workspaces: new InMemoryWorkspaces(),
    agent,
    checks,
    logger: new RecordingLogger(),
    clock: new SteppingClock("2026-11-02T10:00:00.000Z", CLOCK_STEP_MS),
  } satisfies EvaluationDependencies;
  return dependencies;
}

describe("evaluateTask", () => {
  it("passes a task whose type check and tests pass", async () => {
    const dependencies = setUp();

    const result = await evaluateTask(dependencies, OPTIONS, GET_PET);

    expect(result).toEqual({
      taskId: GET_PET.id,
      category: GET_PET.category,
      outcome: TaskOutcome.Passed,
      durationMs: CLOCK_STEP_MS,
      detail: "",
    });
    expect(dependencies.workspaces.checked).toEqual([DIRECTORY]);
    expect(dependencies.workspaces.removed).toEqual([DIRECTORY]);
    expect(dependencies.logger.records.map((record) => record.event)).toEqual([
      "task_started",
      "step_finished",
      "step_finished",
      "step_finished",
      "task_finished",
    ]);
  });

  it("gives the agent the built prompt and the workspace", async () => {
    const agent = new ScriptedAgent();

    await evaluateTask(setUp(agent), OPTIONS, GET_PET);

    expect(agent.requests).toHaveLength(1);
    expect(agent.requests[0]?.directory).toBe(DIRECTORY);
    expect(agent.requests[0]?.prompt).toContain(`Task: ${GET_PET.prompt}`);
  });

  it("does not check the work of an agent that did not complete", async () => {
    const agent = new ScriptedAgent({ [GET_PET.id]: { isCompleted: false, output: "timed out" } });
    const dependencies = setUp(agent);

    const result = await evaluateTask(dependencies, OPTIONS, GET_PET);

    expect(result.outcome).toBe(TaskOutcome.AgentFailed);
    expect(result.detail).toBe("timed out");
    expect(dependencies.workspaces.checked).toEqual([]);
    expect(dependencies.checks.typechecked).toEqual([]);
    expect(dependencies.logger.records.at(-1)).toMatchObject({
      level: "error",
      event: "task_finished",
    });
  });

  it("stops at a failing type check", async () => {
    const dependencies = setUp(new ScriptedAgent(), new ScriptedChecks({ typecheck: [DIRECTORY] }));

    const result = await evaluateTask(dependencies, OPTIONS, GET_PET);

    expect(result).toMatchObject({ outcome: TaskOutcome.TypecheckFailed, detail: "error TS2304" });
    expect(dependencies.checks.tested).toEqual([]);
    expect(dependencies.logger.records).toContainEqual({
      level: "error",
      event: "step_finished",
      fields: {
        run: "test",
        task: GET_PET.id,
        step: "typecheck",
        isPassed: false,
        output: "error TS2304",
      },
    });
  });

  it("reports failing tests", async () => {
    const dependencies = setUp(new ScriptedAgent(), new ScriptedChecks({ tests: [DIRECTORY] }));

    const result = await evaluateTask(dependencies, OPTIONS, GET_PET);

    expect(result).toMatchObject({ outcome: TaskOutcome.TestsFailed, detail: "1 failed" });
  });

  it("keeps the workspace when asked to", async () => {
    const dependencies = setUp();

    await evaluateTask(dependencies, { ...OPTIONS, isKeepingWorkspaces: true }, GET_PET);

    expect(dependencies.workspaces.removed).toEqual([]);
  });

  it("removes the workspace when the agent adapter throws", async () => {
    const dependencies = setUp(new ThrowingAgent());

    await expect(evaluateTask(dependencies, OPTIONS, GET_PET)).rejects.toThrow(
      "agent adapter crashed",
    );

    expect(dependencies.workspaces.removed).toEqual([DIRECTORY]);
  });
});
