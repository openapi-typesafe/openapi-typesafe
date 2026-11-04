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
  /** `--dedupe-enums` names a shared enum by all of its schemas, not by the first one. */
  DEDUPE_ENUM_NAMES: "dedupe-enum-names",
  /** A schema two discriminators name gets one enum of their values, a mapping before its name. */
  DISCRIMINATOR_VALUES: "discriminator-values",
  /** An exploded object query parameter's properties are keys of `query`, as they are sent. */
  EXPLODED_QUERY_OBJECTS: "exploded-query-objects",
  /** `--enum` declares an enum that lists `null` without it, and the type adds `| null`. */
  NULLABLE_ENUMS: "nullable-enums",
  /** A `prefixItems` tuple is open unless `items` or `unevaluatedItems` closes it (2020-12). */
  PREFIX_ITEMS: "prefix-items",
  /** `readOnly` and `writeOnly` of the schema a `$ref` names, or of `allOf` members, count. */
  READ_WRITE_REFS: "read-write-refs",
  /** Schemas of one root type name without the prefix each get an alias, the earlier numbered. */
  ROOT_TYPE_NUMBERING: "root-type-numbering",
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
  readonly option: "arrayLength" | "dedupeEnums" | "enum" | "rootTypes" | "rootTypesNoSchemaPrefix";
  readonly flag: string;
}

const ROOT_TYPES = { option: "rootTypes", flag: "--root-types" } as const;
const ENUM = { option: "enum", flag: "--enum" } as const;
const NO_SCHEMA_PREFIX = {
  option: "rootTypesNoSchemaPrefix",
  flag: "--root-types-no-schema-prefix",
} as const;

/** The options each fix needs, by fix name; `all` has none. */
const REQUIREMENTS: Readonly<Partial<Record<OutputFixName, readonly OutputFixRequirement[]>>> = {
  [OutputFix.ARRAY_LENGTH_TUPLES]: [{ option: "arrayLength", flag: "--array-length" }],
  [OutputFix.DEDUPE_ENUM_NAMES]: [ENUM, { option: "dedupeEnums", flag: "--dedupe-enums" }],
  [OutputFix.NULLABLE_ENUMS]: [ENUM],
  [OutputFix.ROOT_TYPE_NUMBERING]: [ROOT_TYPES, NO_SCHEMA_PREFIX],
};

function describeRequirement(requirement: OutputFixRequirement): string {
  return `${requirement.option} (${requirement.flag})`;
}

/**
 * A notice for each fix given by name with an option it needs off; it names the options that are
 * off. `all` adds none: it means every fix that applies, so one that does not apply is expected.
 */
export function ineffectiveFixNotices(
  names: readonly OutputFixName[],
  isOptionOn: (option: OutputFixRequirement["option"]) => boolean,
): string[] {
  return [...new Set(names)].flatMap((name) => {
    const missing = (REQUIREMENTS[name] ?? []).filter(({ option }) => !isOptionOn(option));
    return missing.length === 0
      ? []
      : [`Fix "${name}" has no effect without ${missing.map(describeRequirement).join(" and ")}`];
  });
}
