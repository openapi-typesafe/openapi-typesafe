import { parseArgs } from "node:util";

export interface BenchSettings {
  readonly measuredRuns: number;
  readonly warmupRuns: number;
  /** The corpus documents; relative paths resolve against the package directory. */
  readonly documentsDir: string;
  /** The CLI of openapi-typesafe, the generator being measured. */
  readonly candidateCli: string;
  /** The CLI of the published openapi-typescript 7.13.0, the baseline. */
  readonly baselineCli: string;
  /** Corpus file names of the documents to measure; empty means all of them. */
  readonly documentFileNames: readonly string[];
}

/**
 * Seven runs keep the median stable when a few runs are disturbed; the largest document took
 * 10 to 13 s a run on an Apple M5.
 */
const DEFAULT_MEASURED_RUNS = 7;
/** One warm-up run loads the document and the generator's files into the file cache. */
const DEFAULT_WARMUP_RUNS = 1;
/** The compatibility harness downloads the corpus here (`pnpm harness fetch --corpus all`). */
const DEFAULT_DOCUMENTS_DIR = "../compat-harness/.cache/compat/documents";
const DEFAULT_CANDIDATE_CLI = "../../packages/openapi-typesafe/bin/cli.js";
/** `tools/compat-harness/scripts/prepare-generators.sh` installs the published 7.13.0 here. */
const DEFAULT_BASELINE_CLI = [
  "../compat-harness/.cache/compat/generators/upstream-7.13.0",
  "node_modules/openapi-typescript/bin/cli.js",
].join("/");

/** A whole number of at least `minimum`; throws with the option name otherwise. */
function parseCount(option: string, text: string | undefined, fallback: number, minimum: number) {
  if (text === undefined) {
    return fallback;
  }
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < minimum) {
    throw new RangeError(`--${option} must be a whole number of at least ${minimum}: ${text}`);
  }
  return value;
}

/**
 * `--runs <n>`, `--warmups <n>`, `--documents-dir`, `--candidate-cli`, `--baseline-cli` and
 * `--document <corpus file name>` (repeatable).
 */
export function parseSettings(argv: readonly string[]): BenchSettings {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      runs: { type: "string" },
      warmups: { type: "string" },
      "documents-dir": { type: "string" },
      "candidate-cli": { type: "string" },
      "baseline-cli": { type: "string" },
      document: { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });
  return {
    measuredRuns: parseCount("runs", values.runs, DEFAULT_MEASURED_RUNS, 1),
    warmupRuns: parseCount("warmups", values.warmups, DEFAULT_WARMUP_RUNS, 0),
    documentsDir: values["documents-dir"] ?? DEFAULT_DOCUMENTS_DIR,
    candidateCli: values["candidate-cli"] ?? DEFAULT_CANDIDATE_CLI,
    baselineCli: values["baseline-cli"] ?? DEFAULT_BASELINE_CLI,
    documentFileNames: values.document ?? [],
  };
}
