import parser from "yargs-parser";
import { cliError } from "./cli-errors.js";

/** The CLI's arguments, parsed as the original CLI parsed them (yargs-parser). */

/** Boolean flags that become generator options (camelCase; yargs also accepts kebab-case). */
export const GENERATOR_FLAGS = [
  "additionalProperties",
  "alphabetize",
  "arrayLength",
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
// so that the arguments parse exactly as they did.
const BOOLEAN_FLAGS = [...GENERATOR_FLAGS, "check", "contentNever", "help"];

export interface CliArguments {
  /** The schema path or URL; none means stdin, or the APIs of the Redocly config. */
  readonly input: string | undefined;
  readonly output: string | undefined;
  readonly redocly: string | undefined;
  readonly isCheck: boolean;
  readonly isHelp: boolean;
  readonly isVersion: boolean;
  readonly generatorFlags: GeneratorFlags;
}

/** Flags of older versions that were removed or renamed, with the message for each. */
const REMOVED_FLAGS: readonly (readonly [string, string])[] = [
  ["-ap", `The -ap alias has been deprecated. Use "--additional-properties" instead.`],
  ["--immutable-types", `The --immutable-types flag has been renamed to "--immutable".`],
  [
    "--support-array-length",
    `The --support-array-length flag has been renamed to "--array-length".`,
  ],
  ["-it", `The -it alias has been deprecated. Use "--immutable-types" instead.`],
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

/** Parse the arguments after `node cli.js`. Fails with `CLI_FLAG_REMOVED` for an old flag. */
export function parseCliArguments(argv: readonly string[]): CliArguments {
  rejectRemovedFlags(argv);
  const parsed = parser([...argv], {
    boolean: BOOLEAN_FLAGS,
    string: ["output", "redocly"],
    alias: { redocly: ["c"], exportType: ["t"], output: ["o"] },
  });
  return {
    input: optionalString(parsed._[0]),
    output: optionalString(parsed.output),
    redocly: optionalString(parsed.redocly),
    isCheck: parsed.check === true,
    isHelp: "help" in parsed,
    isVersion: "version" in parsed,
    generatorFlags: generatorFlagsOf(parsed),
  };
}
