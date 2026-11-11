import { kebabCase } from "scule";

/** The names of the CLI's flags, in the spellings yargs-parser is told about. */

/** Boolean flags that become generator options (camelCase; yargs also accepts kebab-case). */
export const GENERATOR_FLAGS = [
  "additionalProperties",
  "alphabetize",
  "arrayLength",
  "binaryAsBlob",
  "conditionalEnums",
  "dedupeEnums",
  "defaultNonNullable",
  "emptyObjectsUnknown",
  "enum",
  "enumValues",
  "excludeDeprecated",
  "exportType",
  "generatePathParams",
  "immutable",
  "lint",
  "makePathsEnum",
  "pathParamsAsTypes",
  "propertiesRequiredByDefault",
  "readWriteMarkers",
  "rootTypes",
  "rootTypesKeepCasing",
  "rootTypesNoSchemaPrefix",
] as const;

export type GeneratorFlag = (typeof GENERATOR_FLAGS)[number];

export type GeneratorFlags = Readonly<Partial<Record<GeneratorFlag, boolean>>>;

// `contentNever` was a boolean flag of the original CLI that no code reads; it stays in the list
// so that `--content-never <input>` keeps parsing as a flag and an input.
const CAMEL_CASE_BOOLEAN_FLAGS = [...GENERATOR_FLAGS, "check", "contentNever", "help"];

// yargs-parser matches the `boolean` list by the exact spelling of the flag: with camelCase names
// only, `--root-types schema.yaml` took the path as the flag's value (upstream #2523). Both
// spellings are listed.
export const BOOLEAN_FLAGS = [
  ...CAMEL_CASE_BOOLEAN_FLAGS,
  ...CAMEL_CASE_BOOLEAN_FLAGS.map((flag) => kebabCase(flag)),
];

export const ALIASES = { redocly: ["c"], exportType: ["t"], output: ["o"] };

const CAMEL_CASE_STRING_FLAGS = ["output", "redocly", "fix", "localRefRoot", "remoteRefHosts"];

/** String flags, in both spellings, so that a value such as `8080` is not read as a number. */
export const STRING_FLAGS = [
  ...CAMEL_CASE_STRING_FLAGS,
  ...CAMEL_CASE_STRING_FLAGS.map((flag) => kebabCase(flag)),
];

/** Every name yargs-parser can return for a flag this CLI reads. */
export const KNOWN_FLAGS: ReadonlySet<string> = new Set<string>([
  ...BOOLEAN_FLAGS,
  ...STRING_FLAGS,
  ...Object.values(ALIASES).flat(),
  "version",
]);

export const LONG_PREFIX = "--";
export const SHORT_PREFIX = "-";
export const NEGATION_PREFIX = "--no-";

/** The short aliases of `flags`, as written on the command line (`-t`). */
function aliasesOf(flags: readonly string[]): string[] {
  return Object.entries(ALIASES)
    .filter(([flag]) => flags.includes(flag))
    .flatMap(([, aliases]) => aliases.map((alias) => `${SHORT_PREFIX}${alias}`));
}

/** The boolean flags as written, `--` and `-` included; they take `=true` or `=false`. */
export const BOOLEAN_FLAG_NAMES: ReadonlySet<string> = new Set([
  ...BOOLEAN_FLAGS.map((flag) => `${LONG_PREFIX}${flag}`),
  ...aliasesOf(CAMEL_CASE_BOOLEAN_FLAGS),
]);

/**
 * The flags that take a value, as `canonicalFlagName` gives them: kebab-case, and the short
 * aliases with `--`, since yargs-parser reads `--no-o` as the negation of `-o`.
 */
export const VALUE_FLAG_NAMES: ReadonlySet<string> = new Set([
  ...CAMEL_CASE_STRING_FLAGS.map((flag) => `${LONG_PREFIX}${kebabCase(flag)}`),
  ...aliasesOf(CAMEL_CASE_STRING_FLAGS).map((alias) => `${SHORT_PREFIX}${alias}`),
]);

/** The long flags this CLI reads, as `canonicalFlagName` gives them. */
export const KNOWN_LONG_FLAG_NAMES: ReadonlySet<string> = new Set(
  [...KNOWN_FLAGS]
    .filter((flag) => flag.length > 1)
    .map((flag) => `${LONG_PREFIX}${kebabCase(flag)}`),
);

/** The short flags this CLI reads, without the `-`. */
export const KNOWN_SHORT_FLAGS: ReadonlySet<string> = new Set(Object.values(ALIASES).flat());
