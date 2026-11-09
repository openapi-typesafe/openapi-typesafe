import type { ClaimedFile } from "../application/ports/file-system.js";
import type { GeneratedTypes } from "./cli-dependencies.js";
import {
  type CliRun,
  duplicateOutputError,
  emitOutput,
  ensureOutputIsNotSchema,
  type NamedFile,
  type OutputFile,
} from "./cli-output.js";

/**
 * Writing the generated APIs of a Redocly config. Before the first byte is written, every output
 * is claimed: a missing one is created empty, so the file system gives it its own identity. Two
 * APIs whose files then have one identity fail with `CLI_OUTPUT_DUPLICATE` and write nothing,
 * also when their names looked different (ADR-043, decision 1).
 */

/** An API whose types are generated and not written yet. */
export interface GeneratedApi {
  readonly name: string;
  readonly outputFile: OutputFile;
  readonly types: GeneratedTypes;
}

/** An API whose output is claimed; `claim` is undefined with `--check`, which writes nothing. */
interface ClaimedApi {
  readonly api: GeneratedApi;
  readonly claim: ClaimedFile | undefined;
}

/** The failures of the API an API name maps to; an API without failures was written. */
type ApiFailures = Map<string, unknown[]>;

/** The failure of a step, as a list: empty when it succeeded. */
export function failuresOf(step: () => void): unknown[] {
  try {
    step();
    return [];
  } catch (failure) {
    return [failure];
  }
}

/** Claim the output of each API; an API whose claim fails gets that failure instead. */
function claimOutputs(run: CliRun, apis: readonly GeneratedApi[], failures: ApiFailures) {
  const claimed: ClaimedApi[] = [];
  for (const api of apis) {
    try {
      const claim = run.args.isCheck ? undefined : run.deps.files.claimFile(api.outputFile.file);
      claimed.push({ api, claim });
    } catch (failure) {
      failures.set(api.name, [failure]);
    }
  }
  return claimed;
}

/** The APIs that share their claimed file with another, by API name, with the other names. */
function sharedOutputs(claimed: readonly ClaimedApi[]): Map<string, string[]> {
  const byIdentity = new Map<string, string[]>();
  for (const { api, claim } of claimed) {
    if (claim) {
      byIdentity.set(claim.identity, [...(byIdentity.get(claim.identity) ?? []), api.name]);
    }
  }
  const shared = new Map<string, string[]>();
  for (const names of byIdentity.values()) {
    for (const name of names.length > 1 ? names : []) {
      shared.set(
        name,
        names.filter((other) => other !== name).map((other) => `API ${other}`),
      );
    }
  }
  return shared;
}

/** Write one claimed API; a failed write releases the claim, so no empty file is left. */
function writeClaimed(run: CliRun, { api, claim }: ClaimedApi): unknown[] {
  const failures = failuresOf(() => emitOutput(run, api.outputFile, api.types.contents));
  return failures.length > 0 && claim
    ? [...failures, ...failuresOf(() => claim.release())]
    : failures;
}

/**
 * Write (or `--check`) every API unless its output is a file the run read or the file of another
 * API. Returns the failures by API name. Claims are released in reverse order, so a directory
 * one claim created is empty by the time it is removed.
 */
export function writeGeneratedApis(
  run: CliRun,
  apis: readonly GeneratedApi[],
  readFiles: readonly NamedFile[],
): ApiFailures {
  const failures: ApiFailures = new Map();
  const ownOutputs = apis.filter((api) => {
    const failure = failuresOf(() => ensureOutputIsNotSchema(run, api.outputFile, readFiles));
    failures.set(api.name, failure);
    return failure.length === 0;
  });
  const claimed = claimOutputs(run, ownOutputs, failures);
  const shared = sharedOutputs(claimed);
  for (const entry of [...claimed].reverse()) {
    const { api, claim } = entry;
    const others = shared.get(api.name);
    if (others) {
      const release = claim ? failuresOf(() => claim.release()) : [];
      failures.set(api.name, [duplicateOutputError(api.outputFile, others), ...release]);
    }
  }
  for (const entry of claimed.filter(({ api }) => !shared.has(api.name))) {
    failures.set(entry.api.name, writeClaimed(run, entry));
  }
  return failures;
}
