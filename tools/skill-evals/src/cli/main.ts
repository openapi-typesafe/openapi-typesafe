import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandCodingAgent } from "../adapters/command-coding-agent.ts";
import { FileTaskCatalog } from "../adapters/file-task-catalog.ts";
import { JsonLinesFileLogger } from "../adapters/json-lines-file-logger.ts";
import { NodeProcessRunner } from "../adapters/node-process-runner.ts";
import { NodeProjectChecks } from "../adapters/node-project-checks.ts";
import { ReferenceSolutionAgent, UntouchedAgent } from "../adapters/stand-in-agents.ts";
import { SystemClock } from "../adapters/system-clock.ts";
import { TemporaryWorkspaces } from "../adapters/temporary-workspaces.ts";
import type { EvaluationDependencies } from "../application/evaluate-task.ts";
import { runEvals, validateTasks } from "../application/run-evals.ts";
import { type EvalTask, selectTasks } from "../domain/eval-task.ts";
import { summarizeResults } from "../domain/task-result.ts";
import { resolveAgentPreset } from "./agents.ts";
import { formatEvalReport, formatValidationReport } from "./report.ts";
import { CHECK_TIMEOUT_MS, Command, type EvalSettings, parseSettings } from "./settings.ts";

/** The package directory; relative paths resolve against it, not against the shell cwd. */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, "../..");
const TASKS_DIR = join(PACKAGE_ROOT, "tasks");
const NODE_MODULES_DIR = join(PACKAGE_ROOT, "node_modules");
const USAGE_ERROR_EXIT_CODE = 2;
/** Stand-in agents only copy files, so many tasks can run at once. */
const VALIDATION_CONCURRENCY = 8;

type Dependencies = Omit<EvaluationDependencies, "agent">;

function createDependencies(
  skillTargetPath: string | undefined,
  logger: JsonLinesFileLogger,
  clock: SystemClock,
): Dependencies {
  const runner = new NodeProcessRunner();
  const workspaces = new TemporaryWorkspaces({
    tempRoot: join(tmpdir(), "openapi-typesafe-skill-evals"),
    templateDir: join(PACKAGE_ROOT, "template"),
    tasksDir: TASKS_DIR,
    kitFile: join(PACKAGE_ROOT, "kit", "fake-api.ts"),
    nodeModulesDir: NODE_MODULES_DIR,
    skill:
      skillTargetPath === undefined
        ? undefined
        : {
            sourceDir: join(REPOSITORY_ROOT, "skills", "openapi-typesafe"),
            targetPath: skillTargetPath,
          },
  });
  const checks = new NodeProjectChecks({
    runner,
    typescriptCli: join(NODE_MODULES_DIR, "typescript", "bin", "tsc"),
    vitestCli: join(NODE_MODULES_DIR, "vitest", "vitest.mjs"),
    timeoutMs: CHECK_TIMEOUT_MS,
  });
  return { workspaces, checks, logger, clock };
}

async function runEvalCommand(
  settings: EvalSettings,
  tasks: readonly EvalTask[],
  log: { readonly logger: JsonLinesFileLogger; readonly clock: SystemClock },
): Promise<number> {
  const preset = resolveAgentPreset(settings.agentName, settings.model);
  const skillTarget = settings.isWithoutSkill ? undefined : preset.skillTargetPath;
  const dependencies = createDependencies(skillTarget, log.logger, log.clock);
  const agent = new CommandCodingAgent({
    agent: preset,
    runner: new NodeProcessRunner(),
    timeoutMs: settings.agentTimeoutMs,
    transcriptDir: log.logger.path.replace(/\.jsonl$/, ""),
  });
  const runLabel = `${settings.agentName}:${settings.model}${settings.isWithoutSkill ? ":no-skill" : ""}`;
  const results = await runEvals({ ...dependencies, agent }, { ...settings, runLabel }, tasks);
  const summary = summarizeResults(results);
  process.stdout.write(formatEvalReport(results, summary));
  return summary.isTargetMet ? 0 : 1;
}

async function runValidateCommand(
  settings: EvalSettings,
  tasks: readonly EvalTask[],
  log: { readonly logger: JsonLinesFileLogger; readonly clock: SystemClock },
): Promise<number> {
  const dependencies = createDependencies(undefined, log.logger, log.clock);
  const agents = {
    reference: new ReferenceSolutionAgent(TASKS_DIR),
    untouched: new UntouchedAgent(),
  };
  const options = { ...settings, concurrency: VALIDATION_CONCURRENCY };
  const problems = await validateTasks(dependencies, agents, options, tasks);
  process.stdout.write(formatValidationReport(tasks.length, problems));
  return problems.length === 0 ? 0 : 1;
}

/** Entry point and composition root: `node src/cli/main.ts <eval|validate> [options]`. */
async function main(argv: readonly string[]): Promise<number> {
  let settings: EvalSettings;
  let tasks: readonly EvalTask[];
  try {
    settings = parseSettings(argv);
    tasks = selectTasks(await new FileTaskCatalog(TASKS_DIR).list(), settings.taskIds);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return USAGE_ERROR_EXIT_CODE;
  }
  const clock = new SystemClock();
  const logName = `${clock.now().toISOString().replaceAll(":", "-")}-${settings.command}.jsonl`;
  const logger = new JsonLinesFileLogger(
    join(resolve(PACKAGE_ROOT, settings.logDir), logName),
    clock,
  );
  process.stdout.write(`Log: ${logger.path}\n`);
  const log = { logger, clock };
  return settings.command === Command.Eval
    ? runEvalCommand(settings, tasks, log)
    : runValidateCommand(settings, tasks, log);
}

process.exitCode = await main(process.argv.slice(2));
