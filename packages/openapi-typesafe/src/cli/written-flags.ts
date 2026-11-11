import { kebabCase } from "scule";
import { cliError } from "./cli-errors.js";
import {
  BOOLEAN_FLAG_NAMES,
  KNOWN_LONG_FLAG_NAMES,
  KNOWN_SHORT_FLAGS,
  LONG_PREFIX,
  NEGATION_PREFIX,
  SHORT_PREFIX,
  VALUE_FLAG_NAMES,
} from "./cli-flag-names.js";

/**
 * Checks of the flags as the user wrote them, before yargs-parser reads them: yargs-parser accepts
 * any spelling and value, so what it cannot tell apart is checked here.
 */

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

const OPTIONS_END = "--";
const VALUE_SEPARATOR = "=";
const BOOLEAN_VALUES: ReadonlySet<string> = new Set(["true", "false"]);
const LETTER = /^[a-z]$/i;

/** A flag as written before `--`: its name (`--redoc`, `-o`) and the text after `=`, if any. */
export interface WrittenFlag {
  readonly name: string;
  readonly value: string | undefined;
}

export function writtenFlags(argv: readonly string[]): WrittenFlag[] {
  const end = argv.indexOf(OPTIONS_END);
  return (end === -1 ? argv : argv.slice(0, end))
    .filter((arg) => arg.startsWith(SHORT_PREFIX) && arg !== SHORT_PREFIX)
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
export function rejectRemovedFlags(flags: readonly WrittenFlag[]): void {
  const names = new Set(flags.map(({ name }) => canonicalFlagName(name)));
  for (const [flag, message] of REMOVED_FLAGS) {
    if (names.has(flag)) {
      throw cliError("CLI_FLAG_REMOVED", message);
    }
  }
}

/**
 * A boolean flag takes `=true` or `=false`, and its `--no-` form takes no value. yargs-parser read
 * any other value as false (`--enum=1`, `--alphabetize=yes`), which turned the option off.
 */
export function rejectInvalidBooleans(flags: readonly WrittenFlag[]): void {
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

/**
 * A flag that takes a value has no `--no-` form: yargs-parser gave it the value false, which the
 * CLI read as the text "false" (`--no-output` wrote a file named `false`).
 */
export function rejectNegatedValueFlags(flags: readonly WrittenFlag[]): void {
  for (const { name } of flags) {
    if (name.startsWith(NEGATION_PREFIX) && VALUE_FLAG_NAMES.has(canonicalFlagName(name))) {
      throw cliError(
        "CLI_FLAG_INVALID",
        `${name}: a flag that takes a value has no --no- form. Leave the flag out instead.`,
      );
    }
  }
}

/** The bare names of the unknown flags in a written long flag or a group of short flags. */
function unknownNamesOf({ name }: WrittenFlag): string[] {
  if (name.startsWith(LONG_PREFIX)) {
    return KNOWN_LONG_FLAG_NAMES.has(canonicalFlagName(name))
      ? []
      : [name.slice(LONG_PREFIX.length)];
  }
  return [...name.slice(SHORT_PREFIX.length)].filter(
    (letter) => LETTER.test(letter) && !KNOWN_SHORT_FLAGS.has(letter),
  );
}

/**
 * The unknown flags, to declare as boolean: yargs-parser gives an undeclared flag the next
 * argument as its value, so `--alphabetise api.yaml` took the schema path and read stdin. An
 * unknown flag is ignored, so it takes a value only as `--flag=value`.
 */
export function unknownFlagNames(flags: readonly WrittenFlag[]): string[] {
  return [...new Set(flags.flatMap(unknownNamesOf))];
}
