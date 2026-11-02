import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import type { CommandOutcome, CommandRun, CommandRunner } from "./ports.ts";

/** Whether a command exited with code 0 in time. */
export const isSuccessful = (outcome: CommandOutcome): boolean =>
  outcome.exitCode === 0 && !outcome.isTimedOut;

/** Run a command the harness itself needs (packing, unpacking); any failure stops the run. */
export async function runRequired(runner: CommandRunner, run: CommandRun): Promise<void> {
  const outcome = await runner.run(run);
  if (!isSuccessful(outcome)) {
    const reason = outcome.isTimedOut ? "timed out" : `exited with ${outcome.exitCode}`;
    throw new HarnessError(
      HarnessErrorCode.CommandFailed,
      `${run.command.join(" ")} ${reason} in ${run.cwd}:\n${outcome.outputTail}`,
    );
  }
}
