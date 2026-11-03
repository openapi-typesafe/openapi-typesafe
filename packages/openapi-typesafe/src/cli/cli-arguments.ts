import { kebabCase } from "scule";
import parser from "yargs-parser";
import type { OutputFixName } from "../domain/output-fixes.js";
import { cliError } from "./cli-errors.js";
import { fixNamesOf } from "./fix-option.js";

/** The CLI's arguments, parsed as the original CLI parsed them (yargs-parser). */

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
const BOOLEAN_FLAGS = [
  ...CAMEL_CASE_BOOLEAN_FLAGS,
  ...CAMEL_CASE_BOOLEAN_FLAGS.map((flag) => kebabCase(flag)),
];

/** The `$ref` limits as the user wrote them; unset flags are absent. */
export interface CliRefLimits {
  readonly localRefRoot?: string;
  readonly remoteRefHosts?: readonly string[];
}

export interface CliArguments {
  /** The schema path or URL; none means stdin, or the APIs of the Redocly config. */
  readonly input: string | undefined;
  readonly output: string | undefined;
  readonly redocly: string | undefined;
  readonly isCheck: boolean;
  readonly isHelp: boolean;
  readonly isVersion: boolean;
  readonly generatorFlags: GeneratorFlags;
  readonly refLimits: CliRefLimits;
  /** `--fix`, comma-separated and repeatable (ADR-021); unset when the flag is not given. */
  readonly fix: readonly OutputFixName[] | undefined;
  /** Flags the CLI does not know, as written on the command line (`--bogus`, `-x`). */
  readonly unknownFlags: readonly string[];
}

/** Flags of older versions that were removed or renamed, with the message for each. */
const REMOVED_FLAGS: readonly (readonly [string, string])[] = [
  ["-ap", `The -ap alias has been deprecated. Use "--additional-properties" instead.`],
  ["--immutable-types", `The --immutable-types flag has been renamed to "--immutable".`],
  [
    "--support-array-length",
    `The --support-array-length flag has been renamed to "--array-length".`,
  ],
  ["-it", `The -it alias has been deprecated. Use "--immutable" instead.`],
  ["--redoc", `The --redoc config flag has been renamed to "--redocly" (or -c as shorthand).`],
];

/** Flags that only work together with `--root-types`. */
const ROOT_TYPES_FLAGS = ["--root-types-no-schema-prefix", "--root-types-keep-casing"] as const;

function rejectRemovedFlags(argv: readonly string[]): void {
  for (const [flag, message] of REMOVED_FLAGS) {
    if (argv.includes(flag)) {
      throw cliError("CLI_FLAG_REMOVED", message);
    }
  }
}

/** Notices for flags that have no effect in this combination, printed before the run. */
export function ineffectiveFlagNotices(argv: readonly string[]): string[] {
  if (argv.includes("--root-types")) {
    return [];
  }
  return ROOT_TYPES_FLAGS.filter((flag) => argv.includes(flag)).map(
    (flag) => `${flag} has no effect without --root-types flag`,
  );
}

function generatorFlagsOf(parsed: parser.Arguments): GeneratorFlags {
  const flags: Partial<Record<GeneratorFlag, boolean>> = {};
  for (const name of GENERATOR_FLAGS) {
    if (typeof parsed[name] === "boolean") {
      flags[name] = parsed[name];
    }
  }
  return flags;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

/** The last value of a flag that may be given more than once. */
function lastString(value: unknown): string | undefined {
  return optionalString(Array.isArray(value) ? value.at(-1) : value);
}

/** `--remote-ref-hosts a.example,b.example`, repeatable; an empty value allows no host. */
function hostList(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return [value]
    .flat()
    .flatMap((entry) => String(entry).split(","))
    .map((host) => host.trim())
    .filter((host) => host !== "");
}

function refLimitsOf(parsed: parser.Arguments): CliRefLimits {
  const localRefRoot = lastString(parsed.localRefRoot);
  const remoteRefHosts = hostList(parsed.remoteRefHosts);
  return {
    ...(localRefRoot === undefined ? {} : { localRefRoot }),
    ...(remoteRefHosts === undefined ? {} : { remoteRefHosts }),
  };
}

/** String flags, in both spellings, so that a value such as `8080` is not read as a number. */
const STRING_FLAGS = [
  "output",
  "redocly",
  "fix",
  ...["localRefRoot", "remoteRefHosts"].flatMap((flag) => [flag, kebabCase(flag)]),
];

const ALIASES = { redocly: ["c"], exportType: ["t"], output: ["o"] };

/** Every name yargs-parser can return for a flag this CLI reads. */
const KNOWN_FLAGS = new Set<string>([
  ...BOOLEAN_FLAGS,
  ...STRING_FLAGS,
  ...Object.values(ALIASES).flat(),
  "version",
]);

/**
 * Flags that no code reads. The original CLI ignored them silently, so a typo such as
 * `--alphabetise` gave other output with no hint; they still do not fail the run.
 */
function unknownFlagsOf(parsed: parser.Arguments): string[] {
  const names = Object.keys(parsed)
    .filter((key) => key !== "_" && key !== "--" && !KNOWN_FLAGS.has(key))
    .map((key) => (key.length === 1 ? `-${key}` : `--${kebabCase(key)}`));
  return [...new Set(names)];
}

/**
 * Parse the arguments after `node cli.js`. Fails with `CLI_FLAG_REMOVED` for an old flag and with
 * `OPTION_FIX_UNKNOWN` for an unknown `--fix` name.
 */
export function parseCliArguments(argv: readonly string[]): CliArguments {
  rejectRemovedFlags(argv);
  const parsed = parser([...argv], {
    boolean: BOOLEAN_FLAGS,
    string: STRING_FLAGS,
    alias: ALIASES,
  });
  return {
    input: optionalString(parsed._[0]),
    output: optionalString(parsed.output),
    redocly: optionalString(parsed.redocly),
    isCheck: parsed.check === true,
    isHelp: "help" in parsed,
    isVersion: "version" in parsed,
    generatorFlags: generatorFlagsOf(parsed),
    refLimits: refLimitsOf(parsed),
    fix: fixNamesOf(parsed.fix),
    unknownFlags: unknownFlagsOf(parsed),
  };
}
