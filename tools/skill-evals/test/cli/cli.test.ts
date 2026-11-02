import { describe, expect, it } from "vitest";
import { resolveAgentPreset } from "../../src/cli/agents.ts";
import { formatEvalReport, formatValidationReport } from "../../src/cli/report.ts";
import { Command, parseSettings } from "../../src/cli/settings.ts";
import { summarizeResults, TaskOutcome } from "../../src/domain/task-result.ts";
import { TaskProblem } from "../../src/domain/task-validation.ts";
import { AUTH, GET_PET, resultOf } from "../fakes/tasks.ts";

describe("parseSettings", () => {
  it("uses the defaults", () => {
    expect(parseSettings(["eval"])).toEqual({
      command: Command.Eval,
      taskIds: [],
      agentName: "claude-code",
      model: "sonnet",
      isWithoutSkill: false,
      concurrency: 2,
      isKeepingWorkspaces: false,
      logDir: "../../.logs/skill-evals",
      agentTimeoutMs: 900_000,
    });
  });

  it("reads every option", () => {
    const settings = parseSettings([
      "validate",
      "--task=01-a",
      "--task=02-b",
      "--agent=other",
      "--model=opus",
      "--without-skill",
      "--concurrency=4",
      "--keep-workspaces",
      "--log-dir=/tmp/logs",
      "--agent-timeout=60",
    ]);

    expect(settings).toEqual({
      command: Command.Validate,
      taskIds: ["01-a", "02-b"],
      agentName: "other",
      model: "opus",
      isWithoutSkill: true,
      concurrency: 4,
      isKeepingWorkspaces: true,
      logDir: "/tmp/logs",
      agentTimeoutMs: 60_000,
    });
  });

  it("rejects a missing or unknown command and extra arguments", () => {
    expect(() => parseSettings([])).toThrow('Usage: skill-evals <eval|validate> [options]; got ""');
    expect(() => parseSettings(["run"])).toThrow('got "run"');
    expect(() => parseSettings(["eval", "extra"])).toThrow("Unexpected arguments: extra");
  });

  it("rejects a concurrency that is not a positive whole number", () => {
    expect(() => parseSettings(["eval", "--concurrency=0"])).toThrow(
      "--concurrency needs a positive",
    );
    expect(() => parseSettings(["eval", "--agent-timeout=1.5"])).toThrow(
      "--agent-timeout needs a positive",
    );
  });
});

describe("resolveAgentPreset", () => {
  it("builds the Claude Code command with the model and isolated settings", () => {
    const preset = resolveAgentPreset("claude-code", "haiku");

    expect(preset.command.slice(0, 4)).toEqual(["claude", "-p", "--model", "haiku"]);
    expect(preset.command).toContain("--strict-mcp-config");
    expect(preset.skillTargetPath).toBe(".claude/skills/openapi-typesafe");
  });

  it("rejects an unknown agent with the known names", () => {
    expect(() => resolveAgentPreset("other", "x")).toThrow(
      'Unknown agent "other"; known: claude-code',
    );
  });
});

describe("formatEvalReport", () => {
  it("lists every task, the categories and the verdict", () => {
    const results = [
      resultOf(GET_PET, TaskOutcome.Passed),
      resultOf(AUTH, TaskOutcome.TestsFailed),
    ];

    const report = formatEvalReport(results, summarizeResults(results));

    expect(report).toContain(`${GET_PET.id.padEnd(32)} passed (1 s)`);
    expect(report).toContain("  middleware: 0/1");
    expect(report).toContain("Passed 1/2 (50.0%), TARGET MISSED");
  });

  it("says when the target is met", () => {
    const results = [resultOf(GET_PET, TaskOutcome.Passed)];

    expect(formatEvalReport(results, summarizeResults(results))).toContain("(100.0%), target met");
  });
});

describe("formatValidationReport", () => {
  it("reports that all tasks are valid", () => {
    expect(formatValidationReport(34, [])).toBe("All 34 tasks are valid.\n");
  });

  it("lists every problem with its detail", () => {
    const report = formatValidationReport(2, [
      { taskId: GET_PET.id, problem: TaskProblem.ReferenceFails, detail: "TS2304" },
      { taskId: AUTH.id, problem: TaskProblem.PassesWithoutWork, detail: "" },
    ]);

    expect(report).toBe(
      `${GET_PET.id}: reference-fails\nTS2304\n\n${AUTH.id}: passes-without-work\n\n2 problem(s) in 2 tasks.\n`,
    );
  });
});
