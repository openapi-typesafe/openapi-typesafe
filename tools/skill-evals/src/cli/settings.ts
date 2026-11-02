import { parseArgs } from "node:util";

/** `eval` runs a coding agent on the tasks; `validate` checks the tasks with stand-in agents. */
export const Command = { Eval: "eval", Validate: "validate" } as const;
export type Command = (typeof Command)[keyof typeof Command];

export interface EvalSettings {
  readonly command: Command;
  /** Task ids to run; empty means all. */
  readonly taskIds: readonly string[];
  /** The agent preset of `eval` (see `agents.ts`). */
  readonly agentName: string;
  readonly model: string;
  /** Run the agent without the skill, as a baseline. */
  readonly isWithoutSkill: boolean;
  readonly concurrency: number;
  readonly isKeepingWorkspaces: boolean;
  readonly logDir: string;
  readonly agentTimeoutMs: number;
}

/** Logs go to the repository's `.logs/`, like every other tool (relative to the package). */
const DEFAULT_LOG_DIR = "../../.logs/skill-evals";
const DEFAULT_AGENT = "claude-code";
/** A mid-size model, the kind most coding agents run with by default. */
const DEFAULT_MODEL = "sonnet";
/** Agents are slow and rate-limited; two at a time keeps a full run near half an hour. */
const DEFAULT_CONCURRENCY = 2;
/** The longest task (a migration) takes an agent a few minutes; 15 leaves room for slow runs. */
const DEFAULT_AGENT_TIMEOUT_SECONDS = 900;
const MILLISECONDS_PER_SECOND = 1_000;

/** A type check takes seconds; the slowest hidden check runs the generator and a nested Vitest. */
export const CHECK_TIMEOUT_MS = 180_000;

function parsePositiveInteger(name: string, text: string | undefined, fallback: number): number {
  if (text === undefined) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} needs a positive whole number, got "${text}"`);
  }
  return value;
}

function parseCommand(positionals: readonly string[]): Command {
  const [command, ...extra] = positionals;
  if (command !== Command.Eval && command !== Command.Validate) {
    throw new Error(`Usage: skill-evals <eval|validate> [options]; got "${command ?? ""}"`);
  }
  if (extra.length > 0) {
    throw new Error(`Unexpected arguments: ${extra.join(" ")}`);
  }
  return command;
}

/** Parse the command line. Throws on unknown options and bad values. */
export function parseSettings(argv: readonly string[]): EvalSettings {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      task: { type: "string", multiple: true },
      agent: { type: "string" },
      model: { type: "string" },
      "without-skill": { type: "boolean" },
      concurrency: { type: "string" },
      "keep-workspaces": { type: "boolean" },
      "log-dir": { type: "string" },
      "agent-timeout": { type: "string" },
    },
    strict: true,
    allowPositionals: true,
  });
  const timeoutSeconds = parsePositiveInteger(
    "agent-timeout",
    values["agent-timeout"],
    DEFAULT_AGENT_TIMEOUT_SECONDS,
  );
  return {
    command: parseCommand(positionals),
    taskIds: values.task ?? [],
    agentName: values.agent ?? DEFAULT_AGENT,
    model: values.model ?? DEFAULT_MODEL,
    isWithoutSkill: values["without-skill"] ?? false,
    concurrency: parsePositiveInteger("concurrency", values.concurrency, DEFAULT_CONCURRENCY),
    isKeepingWorkspaces: values["keep-workspaces"] ?? false,
    logDir: values["log-dir"] ?? DEFAULT_LOG_DIR,
    agentTimeoutMs: timeoutSeconds * MILLISECONDS_PER_SECOND,
  };
}
