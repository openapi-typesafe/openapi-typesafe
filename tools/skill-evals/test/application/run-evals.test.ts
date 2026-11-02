import { describe, expect, it } from "vitest";
import { runEvals, validateTasks } from "../../src/application/run-evals.ts";
import { TaskOutcome } from "../../src/domain/task-result.ts";
import { TaskProblem } from "../../src/domain/task-validation.ts";
import { InMemoryWorkspaces } from "../fakes/in-memory-workspaces.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";
import { ScriptedAgent } from "../fakes/scripted-agent.ts";
import { ScriptedChecks } from "../fakes/scripted-checks.ts";
import { SteppingClock } from "../fakes/stepping-clock.ts";
import { AUTH, GET_PET } from "../fakes/tasks.ts";

const OPTIONS = { concurrency: 2, isKeepingWorkspaces: false };

function shared(checks = new ScriptedChecks()) {
  return {
    workspaces: new InMemoryWorkspaces(),
    checks,
    logger: new RecordingLogger(),
    clock: new SteppingClock("2026-11-02T10:00:00.000Z", 1),
  };
}

describe("runEvals", () => {
  it("returns one result per task in order and logs the summary", async () => {
    const dependencies = {
      ...shared(new ScriptedChecks({ tests: [`/work/${AUTH.id}`] })),
      agent: new ScriptedAgent(),
    };

    const results = await runEvals(dependencies, { ...OPTIONS, runLabel: "claude" }, [
      GET_PET,
      AUTH,
    ]);

    expect(results.map((result) => result.outcome)).toEqual([
      TaskOutcome.Passed,
      TaskOutcome.TestsFailed,
    ]);
    expect(dependencies.logger.records.at(-1)).toEqual({
      level: "info",
      event: "run_finished",
      fields: { run: "claude", total: 2, passed: 1, passRate: 0.5, isTargetMet: false },
    });
  });
});

describe("validateTasks", () => {
  it("reports tasks whose reference fails or whose checks pass untouched", async () => {
    const dependencies = shared();
    const agents = {
      reference: new ScriptedAgent({ [GET_PET.id]: { isCompleted: false, output: "copy failed" } }),
      untouched: new ScriptedAgent(),
    };

    const problems = await validateTasks(dependencies, agents, OPTIONS, [GET_PET]);

    expect(problems).toEqual([
      { taskId: GET_PET.id, problem: TaskProblem.ReferenceFails, detail: "copy failed" },
      { taskId: GET_PET.id, problem: TaskProblem.PassesWithoutWork, detail: "" },
    ]);
    expect(
      dependencies.logger.records.filter((record) => record.event === "task_invalid"),
    ).toHaveLength(2);
  });
});
