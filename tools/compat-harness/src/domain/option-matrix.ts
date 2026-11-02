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

/** Select option sets by id; "all" selects the whole matrix. Throws on an unknown id. */
export function selectOptionSets(ids: readonly string[]): readonly GeneratorOptionSet[] {
  const matrix = buildOptionMatrix();
  if (ids.includes("all")) {
    return matrix;
  }
  return ids.map((id) => {
    const optionSet = matrix.find((candidate) => candidate.id === id);
    if (!optionSet) {
      throw new HarnessError(HarnessErrorCode.UnknownOptionSet, `Unknown option set: ${id}`);
    }
    return optionSet;
  });
}
