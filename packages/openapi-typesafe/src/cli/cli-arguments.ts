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
const ROOT_TYPES_FLAGS = ["rootTypesNoSchemaPrefix", "rootTypesKeepCasing"] as const;

const OPTIONS_END = "--";
const LONG_PREFIX = "--";
const NEGATION_PREFIX = "--no-";
const VALUE_SEPARATOR = "=";
const BOOLEAN_VALUES: ReadonlySet<string> = new Set(["true", "false"]);

/** A flag as written before `--`: its name (`--redoc`, `-o`) and the text after `=`, if any. */
interface WrittenFlag {
  readonly name: string;
  readonly value: string | undefined;
}

function writtenFlags(argv: readonly string[]): WrittenFlag[] {
  const end = argv.indexOf(OPTIONS_END);
  return (end === -1 ? argv : argv.slice(0, end))
    .filter((arg) => arg.startsWith("-") && arg !== "-")
    .map((arg) => {
      const at = arg.indexOf(VALUE_SEPARATOR);
      return at === -1
        ? { name: arg, value: undefined }
        : { name: arg.slice(0, at), value: arg.slice(at + 1) };
    });
}

/**
 * A long flag as yargs-parser reads it: in kebab-case and without `--no-`, so `--immutableTypes`
 * and `--no-immutable-types` are `--immutable-types`. A short flag stays as written.
 */
function canonicalFlagName(name: string): string {
  if (!name.startsWith(LONG_PREFIX)) {
    return name;
  }
  const bare = name.startsWith(NEGATION_PREFIX)
    ? name.slice(NEGATION_PREFIX.length)
    : name.slice(LONG_PREFIX.length);
  return `${LONG_PREFIX}${kebabCase(bare)}`;
}

/** An old flag fails by its name in any spelling, also with a value (`--redoc=redocly.yaml`). */
function rejectRemovedFlags(flags: readonly WrittenFlag[]): void {
  const names = new Set(flags.map(({ name }) => canonicalFlagName(name)));
  for (const [flag, message] of REMOVED_FLAGS) {
    if (names.has(flag)) {
      throw cliError("CLI_FLAG_REMOVED", message);
    }
  }
}

const ALIASES = { redocly: ["c"], exportType: ["t"], output: ["o"] };

/** The short aliases of boolean flags (`-t`), which take a value the same way (`-t=true`). */
const BOOLEAN_ALIASES = Object.entries(ALIASES)
  .filter(([flag]) => CAMEL_CASE_BOOLEAN_FLAGS.includes(flag))
  .flatMap(([, aliases]) => aliases.map((alias) => `-${alias}`));

const BOOLEAN_FLAG_NAMES: ReadonlySet<string> = new Set([
  ...BOOLEAN_FLAGS.map((flag) => `${LONG_PREFIX}${flag}`),
  ...BOOLEAN_ALIASES,
]);

/**
 * A boolean flag takes `=true` or `=false`, and its `--no-` form takes no value. yargs-parser read
 * any other value as false (`--enum=1`, `--alphabetize=yes`), which turned the option off.
 */
function rejectInvalidBooleans(flags: readonly WrittenFlag[]): void {
  for (const { name, value } of flags) {
    const negated = name.startsWith(NEGATION_PREFIX)
      ? `${LONG_PREFIX}${name.slice(NEGATION_PREFIX.length)}`
      : undefined;
    const isNegatedWithValue = negated !== undefined && BOOLEAN_FLAG_NAMES.has(negated);
    const isInvalid = BOOLEAN_FLAG_NAMES.has(name) && !BOOLEAN_VALUES.has(value ?? "true");
    if (value !== undefined && (isNegatedWithValue || isInvalid)) {
      throw cliError(
        "CLI_FLAG_INVALID",
        `${name}=${value}: a boolean flag takes no value, or =true or =false.`,
      );
    }
  }
}

/** Notices for flags that have no effect in this combination, printed before the run. */
export function ineffectiveFlagNotices(flags: GeneratorFlags): string[] {
  if (flags.rootTypes === true) {
    return [];
  }
  return ROOT_TYPES_FLAGS.filter((flag) => flags[flag] === true).map(
    (flag) => `--${kebabCase(flag)} has no effect without --root-types flag`,
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

/**
 * The last value of a flag that takes one value: given twice, the last one wins, as for the
 * boolean flags (yargs-parser gives a list of every value).
 */
function lastString(value: unknown): string | undefined {
  return optionalString(Array.isArray(value) ? value.at(-1) : value);
}

/**
 * `--remote-ref-hosts a.example,b.example`, repeatable; an empty value allows no host. The
 * `remote-ref-hosts` setting of a `redocly.yaml` API is read the same way.
 */
export function hostList(value: unknown): string[] | undefined {
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
function unknownFlagsOf(parsed: parser.Arguments, argv: readonly string[]): string[] {
  const names = Object.keys(parsed)
    .filter((key) => key !== "_" && key !== "--" && !KNOWN_FLAGS.has(key))
    .map((key) => writtenFlagName(key, argv));
  return [...new Set(names)];
}

/** The flag as the user wrote it: yargs-parser reads `--no-x` as `x: false`. */
function writtenFlagName(key: string, argv: readonly string[]): string {
  if (key.length === 1) {
    return `-${key}`;
  }
  const negated = `--no-${kebabCase(key)}`;
  const isNegated = argv.some((arg) => arg === negated || arg.startsWith(`${negated}=`));
  return isNegated ? negated : `--${kebabCase(key)}`;
}

/**
 * Parse the arguments after `node cli.js`. Fails with `CLI_FLAG_REMOVED` for an old flag, with
 * `CLI_FLAG_INVALID` for a boolean flag with another value than true or false, and with
 * `OPTION_FIX_UNKNOWN` for an unknown `--fix` name.
 */
export function parseCliArguments(argv: readonly string[]): CliArguments {
  const flags = writtenFlags(argv);
  rejectRemovedFlags(flags);
  rejectInvalidBooleans(flags);
  const parsed = parser([...argv], {
    boolean: BOOLEAN_FLAGS,
    string: STRING_FLAGS,
    alias: ALIASES,
  });
  return {
    input: optionalString(parsed._[0]),
    output: lastString(parsed.output),
    redocly: lastString(parsed.redocly),
    isCheck: parsed.check === true,
    isHelp: "help" in parsed,
    isVersion: "version" in parsed,
    generatorFlags: generatorFlagsOf(parsed),
    refLimits: refLimitsOf(parsed),
    fix: fixNamesOf(parsed.fix),
    unknownFlags: unknownFlagsOf(parsed, argv),
  };
}
