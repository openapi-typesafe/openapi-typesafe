import type { Finding, Locate } from "./argument-findings.js";
import { entrypointArgumentFindings } from "./entrypoint-arguments.js";
import { shellScript } from "./shell-scripts.js";
import type { ShellWord } from "./shell-words.js";

/**
 * Which `CMD` of a Dockerfile gives its items to which `ENTRYPOINT` (Docker's rules): within a
 * stage the last of each counts; a stage `FROM` an earlier one inherits its entrypoint, and its
 * command too unless it sets an entrypoint of its own. Only exec forms pair: a shell-form
 * entrypoint ignores the command, and a shell-form command would give `/bin/sh -c …` as arguments.
 */

/**
 * One exec-form array: where its instruction line starts, where the array starts (at the `[`)
 * and ends, and its words.
 */
export interface ExecForm {
  readonly lineStart: number;
  readonly start: number;
  readonly end: number;
  readonly words: readonly ShellWord[];
}

/** The instructions that set stages, entrypoints and commands, at the start of a line. */
const STAGE_INSTRUCTION_RE = /^[ \t]*(FROM|CMD|ENTRYPOINT)\b(.*)$/gm;
/** `FROM [--platform=…] image [AS name]`; a stage name is matched without regard to case. */
const FROM_RE = /^[ \t]+(?:--\S+[ \t]+)*(\S+)(?:[ \t]+AS[ \t]+(\S+))?/i;
const FROM = "FROM";
const CMD = "CMD";
/** How the report names an entrypoint whose script may pass its arguments on. */
const ENTRYPOINT_WRITTEN = "ENTRYPOINT";

/** An entrypoint or command instruction: its exec form, or undefined for the shell form. */
interface Instruction {
  readonly form: ExecForm | undefined;
}

/** One build stage: the image or stage it starts from, its name, and what it sets. */
interface Stage {
  readonly base: string;
  readonly name: string | undefined;
  entrypoint: Instruction | undefined;
  command: Instruction | undefined;
}

/** The stages of a Dockerfile with the last entrypoint and command each sets. */
function dockerStages(text: string, forms: readonly ExecForm[]): Stage[] {
  const formAt = new Map(forms.map((form) => [form.lineStart, form]));
  const stages: Stage[] = [];
  for (const match of text.matchAll(STAGE_INSTRUCTION_RE)) {
    const [, keyword, rest] = match;
    const stage = stages.at(-1);
    if (keyword === FROM) {
      const from = FROM_RE.exec(rest ?? "");
      const name = from?.[2]?.toLowerCase();
      stages.push({ base: from?.[1] ?? "", name, entrypoint: undefined, command: undefined });
    } else if (stage !== undefined) {
      const instruction = { form: formAt.get(match.index) };
      stage[keyword === CMD ? "command" : "entrypoint"] = instruction;
    }
  }
  return stages;
}

/** The stage that `FROM` names by name or by number, among the stages before `index`. */
function baseStage(stages: readonly Stage[], index: number): number {
  const base = stages[index]?.base.toLowerCase();
  return stages.findIndex((stage, at) => at < index && (stage.name === base || `${at}` === base));
}

/** The entrypoint a stage runs: its own, or the one of the stage it starts from. */
function entrypointOf(stages: readonly Stage[], index: number): Instruction | undefined {
  const own = stages[index]?.entrypoint;
  const base = baseStage(stages, index);
  return own ?? (base === -1 ? undefined : entrypointOf(stages, base));
}

/** An exec-form entrypoint of a stage and the exec-form command that it gets as arguments. */
export interface ExecPair {
  readonly entrypoint: ExecForm;
  readonly command: ExecForm;
}

/** The exec-form command of each stage with the exec-form entrypoint it runs with. */
export function entrypointPairs(text: string, forms: readonly ExecForm[]): ExecPair[] {
  const stages = dockerStages(text, forms);
  return stages.flatMap((stage, index) => {
    const entrypoint = entrypointOf(stages, index)?.form;
    const command = stage.command?.form;
    return entrypoint === undefined || command === undefined ? [] : [{ entrypoint, command }];
  });
}

/**
 * The old flags in the exec-form `CMD` of each stage whose entrypoint is a shell script that may
 * pass them on (`ENTRYPOINT ["sh", "-c", "npx openapi-typescript \"$@\"", "--"]`). The command
 * that the items of both make is read as one (entrypoint-arguments.ts), so the flags after an
 * entrypoint that runs the generator are found there.
 */
export function entrypointCommandFindings(pairs: readonly ExecPair[], locate: Locate): Finding[] {
  return pairs.flatMap(({ entrypoint, command }) => {
    if (shellScript(entrypoint.words) === undefined) {
      return [];
    }
    const pair = { entrypoint: entrypoint.words, command: command.words };
    return entrypointArgumentFindings({ ...pair, written: ENTRYPOINT_WRITTEN }, locate);
  });
}
