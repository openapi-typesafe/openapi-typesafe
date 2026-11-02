import { parseArgs } from "node:util";
import { z } from "zod";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";

/** Commands of the harness CLI, in the order a full run uses them. */
export const HarnessCommand = {
  Manifest: "manifest",
  Fetch: "fetch",
  Generate: "generate",
  Compare: "compare",
  Report: "report",
  Dependents: "dependents",
} as const;

export type HarnessCommand = (typeof HarnessCommand)[keyof typeof HarnessCommand];

/** How the dependents command switches a candidate project to openapi-typesafe. */
export const SwitchMode = {
  /** Rename the packages, specifiers and the command in place (ENGINEERING_PLAN 8.4). */
  Names: "names",
  /** Run the migration tool, as a user does (ENGINEERING_PLAN 10.1). */
  Migrate: "migrate",
} as const;

export type SwitchMode = (typeof SwitchMode)[keyof typeof SwitchMode];

/** Defaults of the business parameters; each can be overridden by a CLI option. */
export const HARNESS_DEFAULTS = {
  apisGuruListUrl: "https://api.apis.guru/v2/list.json",
  cacheDir: ".cache/compat",
  logDir: "../../.logs/harness",
  /** Per-PR subset size (ENGINEERING_PLAN 2.6). */
  subsetSize: 200,
  /**
   * Downloads are network-bound; generator runs are CPU-bound, so they default to fewer workers.
   */
  fetchConcurrency: 8,
  workConcurrency: 4,
  /**
   * The largest corpus document (Cloudflare, ~27 MB) takes about a minute; two minutes leaves
   * headroom.
   */
  generatorTimeoutMs: 120_000,
  /**
   * Per step of a dependent project. A cold install of a monorepo takes a few minutes and a full
   * test suite about as long; ten minutes stops a hung watcher without cutting a slow but real run.
   */
  dependentStepTimeoutMs: 600_000,
  /** The openapi-typesafe packages the dependents command packs, relative to this package. */
  packagesDir: "../../packages",
  /** The migration tool's command, relative to this package; it must be built. */
  migrateBin: "../../packages/openapi-typesafe-migrate/bin/migrate.js",
  /** A migration reads and writes each project file once; a minute covers a large monorepo. */
  migrateTimeoutMs: 60_000,
  /** Under the system temporary directory: outside the repository, see DEPENDENTS_WORK_PATHS. */
  dependentsWorkDirName: "openapi-typesafe-dependents",
  /** Large documents download in seconds; a minute covers slow mirrors without hanging the run. */
  httpTimeoutMs: 60_000,
  retryAttempts: 4,
  retryInitialDelayMs: 1_000,
  userAgent: "openapi-typesafe-compat-harness",
} as const;

const PositiveInteger = z.coerce.number().int().positive();

const SettingsSchema = z.object({
  command: z.enum(Object.values(HarnessCommand)),
  cacheDir: z.string().min(1).default(HARNESS_DEFAULTS.cacheDir),
  logDir: z.string().min(1).default(HARNESS_DEFAULTS.logDir),
  apisGuruListUrl: z.url().default(HARNESS_DEFAULTS.apisGuruListUrl),
  /** "all" or a number of entries for `selectCorpusSubset`. */
  corpus: z.union([z.literal("all"), PositiveInteger]).default(HARNESS_DEFAULTS.subsetSize),
  optionSets: z
    .string()
    .min(1)
    .default("default")
    .transform((ids) => ids.split(",").map((id) => id.trim())),
  label: z
    .string()
    .regex(/^[a-z0-9.-]+$/)
    .optional(),
  cli: z.string().min(1).optional(),
  golden: z.string().min(1).optional(),
  candidate: z.string().min(1).optional(),
  isTypeCheckEnabled: z.boolean().default(false),
  isHashUpdateAllowed: z.boolean().default(false),
  concurrency: PositiveInteger.optional(),
  /** Absent: the command default (generator runs or dependent steps). */
  timeoutMs: PositiveInteger.optional(),
  /** Ids of the dependent projects to check; absent: every project of the manifest. */
  projects: z
    .string()
    .min(1)
    .transform((ids) => ids.split(",").map((id) => id.trim()))
    .optional(),
  /** Absent: `<system temporary directory>/openapi-typesafe-dependents`. */
  workDir: z.string().min(1).optional(),
  switchMode: z.enum(Object.values(SwitchMode)).default(SwitchMode.Names),
});

export type HarnessSettings = z.infer<typeof SettingsSchema>;

const CLI_OPTIONS = {
  "cache-dir": { type: "string" },
  "log-dir": { type: "string" },
  "apis-guru-list-url": { type: "string" },
  corpus: { type: "string" },
  "option-sets": { type: "string" },
  label: { type: "string" },
  cli: { type: "string" },
  golden: { type: "string" },
  candidate: { type: "string" },
  types: { type: "boolean" },
  "update-hashes": { type: "boolean" },
  concurrency: { type: "string" },
  "timeout-ms": { type: "string" },
  projects: { type: "string" },
  "work-dir": { type: "string" },
  switch: { type: "string" },
} as const;

/**
 * Parse and validate `harness <command> [options]`. Throws SETTINGS_INVALID with a readable
 * message.
 */
export function parseSettings(argv: readonly string[]): HarnessSettings {
  const { positionals, values } = parseArgs({
    args: [...argv],
    options: CLI_OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  const parsed = SettingsSchema.safeParse({
    command: positionals[0],
    cacheDir: values["cache-dir"],
    logDir: values["log-dir"],
    apisGuruListUrl: values["apis-guru-list-url"],
    corpus: values.corpus,
    optionSets: values["option-sets"],
    label: values.label,
    cli: values.cli,
    golden: values.golden,
    candidate: values.candidate,
    isTypeCheckEnabled: values.types,
    isHashUpdateAllowed: values["update-hashes"],
    concurrency: values.concurrency,
    timeoutMs: values["timeout-ms"],
    projects: values.projects,
    workDir: values["work-dir"],
    switchMode: values.switch,
  });
  if (!parsed.success) {
    throw new HarnessError(HarnessErrorCode.SettingsInvalid, z.prettifyError(parsed.error));
  }
  return parsed.data;
}

/** Return a required option or fail with a message that names the option. */
export function requireOption(
  value: string | undefined,
  option: string,
  command: HarnessCommand,
): string {
  if (value === undefined) {
    throw new HarnessError(
      HarnessErrorCode.SettingsInvalid,
      `The ${command} command needs --${option}`,
    );
  }
  return value;
}
