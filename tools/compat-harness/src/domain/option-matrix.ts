import { HarnessError, HarnessErrorCode } from "./errors.ts";

/** One combination of generator CLI flags. `id` is used in output paths and reports. */
export interface GeneratorOptionSet {
  readonly id: string;
  readonly flags: readonly string[];
}

/** Id of the option set with no flags: the generator defaults. */
export const DEFAULT_OPTION_SET_ID = "default";

/**
 * Boolean CLI flags of the inherited generator that change output (ENGINEERING_PLAN 2.2), each
 * tested alone. `--content-never` and `--generate-path-params` are accepted but not listed in
 * `--help`.
 */
const SINGLE_FLAGS = [
  "--enum",
  "--enum-values",
  "--dedupe-enums",
  "--conditional-enums",
  "--immutable",
  "--alphabetize",
  "--additional-properties",
  "--empty-objects-unknown",
  "--default-non-nullable",
  // The default is true, so only the negative form changes output.
  "--default-non-nullable=false",
  "--properties-required-by-default",
  "--array-length",
  "--path-params-as-types",
  "--export-type",
  "--root-types",
  "--make-paths-enum",
  "--exclude-deprecated",
  "--read-write-markers",
  "--content-never",
  "--generate-path-params",
] as const;

/** Flags that only have an effect together with another flag, or that change each other. */
const DEPENDENT_FLAG_SETS: readonly (readonly string[])[] = [
  ["--root-types", "--root-types-no-schema-prefix"],
  ["--root-types", "--root-types-keep-casing"],
  ["--enum", "--dedupe-enums"],
  ["--enum", "--enum-values"],
  ["--enum", "--conditional-enums"],
  ["--immutable", "--read-write-markers"],
  ["--export-type", "--root-types"],
];

function toOptionSetId(flags: readonly string[]): string {
  return flags.map((flag) => flag.replace(/^--/, "")).join("+");
}

/** Every option set of the matrix, the defaults first. Deterministic order. */
export function buildOptionMatrix(): readonly GeneratorOptionSet[] {
  const combinations: (readonly string[])[] = [
    ...SINGLE_FLAGS.map((flag) => [flag]),
    ...DEPENDENT_FLAG_SETS,
  ];
  const optionSets = combinations.map((flags) => ({ id: toOptionSetId(flags), flags }));
  return [{ id: DEFAULT_OPTION_SET_ID, flags: [] }, ...optionSets];
}

/**
 * An option set with a flag that only openapi-typesafe has and that is off by default (the
 * backlog policy for changes to valid output). The golden generators cannot be compared with it,
 * so its output is checked against the candidate's own output without the flag.
 */
export interface OptInOptionSet extends GeneratorOptionSet {
  /** The option set with the same flags except the opt-in one. */
  readonly baselineOptionSetId: string;
}

/** Selects every option set of the compatibility matrix. */
export const ALL_OPTION_SETS_SELECTOR = "all";

/** Selects every opt-in option set together with its baseline option set. */
export const OPT_IN_OPTION_SETS_SELECTOR = "opt-in";

/**
 * Opt-in flags (roadmap plan §4), each tested alone and with the matrix flags it interacts with.
 * Every combination must also be an option set of the matrix: it is the baseline.
 */
const OPT_IN_FLAGS: readonly { readonly flag: string; readonly with: readonly string[][] }[] = [
  {
    flag: "--binary-as-blob",
    with: [[], ["--immutable"], ["--read-write-markers"], ["--array-length"]],
  },
  // Output fixes (ADR-021). `allof-required` rewrites `required` the way the parent's `required`
  // does, so it is checked with the flags that change required keys and `WithRequired`.
  {
    flag: "--fix=allof-required",
    with: [[], ["--immutable"], ["--properties-required-by-default"], ["--empty-objects-unknown"]],
  },
  // `anyof-properties` combines types and keeps their members, so `unknown` members are the only
  // interaction: `--empty-objects-unknown` makes more of them.
  { flag: "--fix=anyof-properties", with: [[], ["--empty-objects-unknown"]] },
  // `array-length-tuples` does nothing without `--array-length`, the only matrix set it changes.
  { flag: "--fix=array-length-tuples", with: [["--array-length"]] },
  // `unevaluated-properties` adds an index signature: `--immutable` makes it readonly, and
  // `--additional-properties` adds the `unknown` one it is intersected with.
  {
    flag: "--fix=unevaluated-properties",
    with: [[], ["--immutable"], ["--additional-properties"]],
  },
  // `discriminator-values` fixes the value of each discriminator member; `--enum` declares the
  // enums and types the values as members of the owner's enum, `--dedupe-enums` renames that enum.
  {
    flag: "--fix=discriminator-values",
    with: [[], ["--enum"], ["--enum", "--dedupe-enums"]],
  },
  // The other discriminator fixes of ADR-024. `allof-discriminated-union` changes which schemas
  // are union members, which no flag changes.
  { flag: "--fix=allof-discriminated-union", with: [[]] },
  // `discriminator-member-required` adds `WithRequired` keys, so it is checked with the flag that
  // makes more keys required.
  { flag: "--fix=discriminator-member-required", with: [[], ["--properties-required-by-default"]] },
  // `root-type-numbering` does nothing without both root type flags, the only matrix set it changes.
  {
    flag: "--fix=root-type-numbering",
    with: [["--root-types", "--root-types-no-schema-prefix"]],
  },
  // `anyof-oneof-descriptions` changes JSDoc only, which no flag changes.
  { flag: "--fix=anyof-oneof-descriptions", with: [[]] },
  // `dedupe-enum-names` does nothing without `--enum --dedupe-enums`, the only matrix set it changes.
  { flag: "--fix=dedupe-enum-names", with: [["--enum", "--dedupe-enums"]] },
  // `exploded-query-objects` moves keys into `query`: `--immutable` makes them readonly.
  { flag: "--fix=exploded-query-objects", with: [[], ["--immutable"]] },
  // `nullable-enums` does nothing without `--enum`; `--dedupe-enums` shares the enum it declares.
  { flag: "--fix=nullable-enums", with: [["--enum"], ["--enum", "--dedupe-enums"]] },
  // `prefix-items` replaces the tuple that `--array-length` would wrap and `--immutable` makes
  // readonly.
  { flag: "--fix=prefix-items", with: [[], ["--array-length"], ["--immutable"]] },
  // `read-write-refs` adds `readonly` and the `$Read` / `$Write` markers.
  { flag: "--fix=read-write-refs", with: [[], ["--immutable"], ["--read-write-markers"]] },
  { flag: "--fix=all", with: [[], ["--array-length"], ["--enum"]] },
];

/** Every opt-in option set, in a deterministic order. */
export function buildOptInOptionSets(): readonly OptInOptionSet[] {
  return OPT_IN_FLAGS.flatMap(({ flag, with: combinations }) =>
    combinations.map((others) => ({
      id: toOptionSetId([flag, ...others]),
      flags: [flag, ...others],
      baselineOptionSetId: others.length === 0 ? DEFAULT_OPTION_SET_ID : toOptionSetId(others),
    })),
  );
}

function optionSetsOf(id: string): readonly GeneratorOptionSet[] {
  const matrix = buildOptionMatrix();
  if (id === ALL_OPTION_SETS_SELECTOR) {
    return matrix;
  }
  const optInSets = buildOptInOptionSets();
  if (id === OPT_IN_OPTION_SETS_SELECTOR) {
    const baselineIds = new Set(optInSets.map((set) => set.baselineOptionSetId));
    return [...matrix.filter((set) => baselineIds.has(set.id)), ...optInSets];
  }
  const optionSet = [...matrix, ...optInSets].find((candidate) => candidate.id === id);
  if (!optionSet) {
    throw new HarnessError(HarnessErrorCode.UnknownOptionSet, `Unknown option set: ${id}`);
  }
  return [optionSet];
}

/**
 * Select option sets by id or selector (`all`, `opt-in`), without repeats, in the given order.
 * Throws on an unknown id.
 */
export function selectOptionSets(ids: readonly string[]): readonly GeneratorOptionSet[] {
  const selected = new Map<string, GeneratorOptionSet>();
  for (const optionSet of ids.flatMap(optionSetsOf)) {
    selected.set(optionSet.id, selected.get(optionSet.id) ?? optionSet);
  }
  return [...selected.values()];
}
