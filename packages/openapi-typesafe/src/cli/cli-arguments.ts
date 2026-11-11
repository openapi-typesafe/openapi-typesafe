import { kebabCase } from "scule";
import parser from "yargs-parser";
import type { OutputFixName } from "../domain/output-fixes.js";
import { cliError } from "./cli-errors.js";
import {
  ALIASES,
  BOOLEAN_FLAGS,
  GENERATOR_FLAGS,
  type GeneratorFlag,
  type GeneratorFlags,
  STRING_FLAGS,
} from "./cli-flag-names.js";
import { MULTIPLE_SCHEMAS_DOCS_URL } from "./docs-links.js";
import { fixNamesOf } from "./fix-option.js";
import {
  rejectInvalidBooleans,
  rejectNegatedValueFlags,
  rejectRemovedFlags,
  unknownFlagsOf,
  withoutUnknownLongFlags,
  writtenFlags,
} from "./written-flags.js";

export { GENERATOR_FLAGS, type GeneratorFlag, type GeneratorFlags } from "./cli-flag-names.js";

/** The CLI's arguments, parsed as the original CLI parsed them (yargs-parser). */

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

/** Flags that only work together with `--root-types`. */
const ROOT_TYPES_FLAGS = ["rootTypesNoSchemaPrefix", "rootTypesKeepCasing"] as const;

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

/**
 * The one schema argument. More than one fails with `CLI_INPUT_EXTRA`: the original CLI read the
 * first and dropped the rest, so a glob the shell expanded (`g/*.yaml`) generated one schema.
 */
function inputOf(positionals: readonly (string | number)[]): string | undefined {
  if (positionals.length > 1) {
    throw cliError(
      "CLI_INPUT_EXTRA",
      `Only one schema argument is allowed, but ${positionals.length} were given: ` +
        `${positionals.join(" ")}. A shell expands an unquoted *; to generate several ` +
        `schemas, list them under \`apis\` in redocly.yaml. See ${MULTIPLE_SCHEMAS_DOCS_URL}`,
    );
  }
  return optionalString(positionals[0]);
}

/**
 * Parse the arguments after `node cli.js`. Fails with `CLI_FLAG_REMOVED` for an old flag, with
 * `CLI_FLAG_INVALID` for a boolean flag with another value than true or false or a `--no-` form
 * of a flag that takes a value, with `CLI_INPUT_EXTRA` for a second schema argument, and with
 * `OPTION_FIX_UNKNOWN` for an unknown `--fix` name.
 */
export function parseCliArguments(argv: readonly string[]): CliArguments {
  const flags = writtenFlags(argv);
  const unknown = unknownFlagsOf(flags);
  rejectRemovedFlags(flags);
  rejectInvalidBooleans(flags);
  rejectNegatedValueFlags(flags);
  const parsed = parser(withoutUnknownLongFlags(argv), {
    boolean: [...BOOLEAN_FLAGS, ...unknown.shortLetters],
    string: STRING_FLAGS,
    alias: ALIASES,
    // A schema path is a file name: `1.10` is not the number 1.1.
    configuration: { "parse-positional-numbers": false },
  });
  return {
    input: inputOf(parsed._),
    output: lastString(parsed.output),
    redocly: lastString(parsed.redocly),
    isCheck: parsed.check === true,
    isHelp: "help" in parsed,
    isVersion: "version" in parsed,
    generatorFlags: generatorFlagsOf(parsed),
    refLimits: refLimitsOf(parsed),
    fix: fixNamesOf(parsed.fix),
    unknownFlags: unknown.asWritten,
  };
}
