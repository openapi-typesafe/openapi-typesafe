import { ERROR_CODES, OpenAPITypesafeError } from "./errors.js";

/**
 * Opt-in fixes of the output of valid schemas (ADR-021). Each one changes only the cases it names;
 * without any, the output is the same as openapi-typescript 7.13 gives. In 2.0 they become the
 * default.
 */
export const OutputFix = {
  /** An `allOf` member with only `required` makes those properties of the others required. */
  ALLOF_REQUIRED: "allof-required",
  /** `anyOf` next to object keywords or `allOf` is intersected with them, not added to a union. */
  ANYOF_PROPERTIES: "anyof-properties",
  /** `--array-length` tuples have `min` to `max` items, nest right and follow `--immutable`. */
  ARRAY_LENGTH_TUPLES: "array-length-tuples",
  /** A schema two discriminators name gets one enum of their values, a mapping before its name. */
  DISCRIMINATOR_VALUES: "discriminator-values",
  /** `unevaluatedProperties` types the keys no other keyword declares (an index signature). */
  UNEVALUATED_PROPERTIES: "unevaluated-properties",
} as const;
export type OutputFix = (typeof OutputFix)[keyof typeof OutputFix];

/** Every fix of this version, in the order the docs list them. */
export const OUTPUT_FIXES: readonly OutputFix[] = Object.values(OutputFix);

/** The name that turns on every fix of the installed version. */
export const ALL_OUTPUT_FIXES = "all";

/** A name the `fix` option accepts: one fix, or `all`. */
export type OutputFixName = OutputFix | typeof ALL_OUTPUT_FIXES;

const KNOWN_NAMES: ReadonlySet<string> = new Set<string>([...OUTPUT_FIXES, ALL_OUTPUT_FIXES]);

function isOutputFixName(value: unknown): value is OutputFixName {
  return typeof value === "string" && KNOWN_NAMES.has(value);
}

/** The fix names as given; fails with `OPTION_FIX_UNKNOWN` for any other value. */
export function outputFixNamesOf(values: readonly unknown[]): readonly OutputFixName[] {
  const unknown = values.filter((value) => !isOutputFixName(value));
  if (unknown.length > 0) {
    const names = unknown.map((value) => JSON.stringify(value)).join(", ");
    const known = [...KNOWN_NAMES].join(", ");
    throw new OpenAPITypesafeError({
      code: ERROR_CODES.OPTION_FIX_UNKNOWN,
      message: `Unknown fix ${names}. Known fixes: ${known}.`,
      details: { unknown, known: [...KNOWN_NAMES] },
    });
  }
  return values as readonly OutputFixName[];
}

/** The fixes the names turn on; `all` stands for every fix of this version. */
export function resolveOutputFixes(names: readonly OutputFixName[]): ReadonlySet<OutputFix> {
  return new Set(names.flatMap((name) => (name === ALL_OUTPUT_FIXES ? OUTPUT_FIXES : [name])));
}

/** A generator option that a fix works with; without it, the fix changes nothing (ADR-021). */
export interface OutputFixRequirement {
  readonly option: "arrayLength";
  readonly flag: string;
}

/** By fix name; `all` has none. */
const REQUIREMENTS: Readonly<Partial<Record<OutputFixName, OutputFixRequirement>>> = {
  [OutputFix.ARRAY_LENGTH_TUPLES]: { option: "arrayLength", flag: "--array-length" },
};

/**
 * A notice for each fix given by name whose option is off. `all` adds none: it means every fix
 * that applies, so one that does not apply is expected.
 */
export function ineffectiveFixNotices(
  names: readonly OutputFixName[],
  isOptionOn: (option: OutputFixRequirement["option"]) => boolean,
): string[] {
  return [...new Set(names)].flatMap((name) => {
    const requirement = REQUIREMENTS[name];
    return requirement === undefined || isOptionOn(requirement.option)
      ? []
      : [`Fix "${name}" has no effect without ${requirement.option} (${requirement.flag})`];
  });
}
