import { ERROR_CODES, OpenAPITypesafeError } from "./errors.js";

/**
 * Opt-in fixes of the output of valid schemas (ADR-021). Each one changes only the cases it names;
 * without any, the output is the same as openapi-typescript 7.13 gives. In 2.0 they become the
 * default. The object names the fixes for this package's code; the public API is the `OutputFix`
 * union and the `OUTPUT_FIXES` list (ADR-021, amendment 1).
 */
export const FIX = {
  /** An `allOf` `$ref` to a discriminated union is the union, without `Omit` or a schema name. */
  ALLOF_DISCRIMINATED_UNION: "allof-discriminated-union",
  /** An `allOf` member with only `required` makes those properties of the others required. */
  ALLOF_REQUIRED: "allof-required",
  /** The JSDoc of a schema lists the descriptions of its `anyOf` and `oneOf` members. */
  ANYOF_ONEOF_DESCRIPTIONS: "anyof-oneof-descriptions",
  /** `anyOf` / `oneOf` variants with only `required` make those keys of the parent required. */
  ANYOF_ONEOF_REQUIRED: "anyof-oneof-required",
  /** `anyOf` next to object keywords or `allOf` is intersected with them, not added to a union. */
  ANYOF_PROPERTIES: "anyof-properties",
  /** `--array-length` tuples have `min` to `max` items, nest right and follow `--immutable`. */
  ARRAY_LENGTH_TUPLES: "array-length-tuples",
  /** `--dedupe-enums` names a shared enum by all of its schemas, not by the first one. */
  DEDUPE_ENUM_NAMES: "dedupe-enum-names",
  /** `required` next to an `allOf` `$ref` to a discriminator member still gives `WithRequired`. */
  DISCRIMINATOR_MEMBER_REQUIRED: "discriminator-member-required",
  /**
   * The value a discriminator member gets: one enum of every discriminator's values, a mapping
   * before the schema name, a schema's own mapping before an inherited one, none where the member
   * declares it, and with `--enum` a member of the owner's enum.
   */
  DISCRIMINATOR_VALUES: "discriminator-values",
  /** An exploded object query parameter's properties are keys of `query`, as they are sent. */
  EXPLODED_QUERY_OBJECTS: "exploded-query-objects",
  /** `--enum` declares an enum that lists `null` without it, and the type adds `| null`. */
  NULLABLE_ENUMS: "nullable-enums",
  /** `--path-params-as-types` gives each `{name}` its placeholder, `{number}` included. */
  PATH_PARAM_TYPE_NAMES: "path-param-type-names",
  /** A `prefixItems` tuple is open unless `items` or `unevaluatedItems` closes it (2020-12). */
  PREFIX_ITEMS: "prefix-items",
  /** `readOnly` and `writeOnly` of the schema a `$ref` names, or of `allOf` members, count. */
  READ_WRITE_REFS: "read-write-refs",
  /**
   * A `$ref` into schema keywords (`content/<type>/schema`, `items`, `allOf/0`) gets the type it
   * points at, also where the original type compiles through an index signature.
   */
  REF_POINTERS: "ref-pointers",
  /** Schemas of one root type name without the prefix each get an alias, the earlier numbered. */
  ROOT_TYPE_NUMBERING: "root-type-numbering",
  /** `unevaluatedProperties` types the keys no other keyword declares (an index signature). */
  UNEVALUATED_PROPERTIES: "unevaluated-properties",
} as const;
/** The name of one opt-in output fix. */
export type OutputFix = (typeof FIX)[keyof typeof FIX];

/** Every fix of this version, in the order the docs list them. */
export const OUTPUT_FIXES: readonly OutputFix[] = Object.values(FIX);

/** The name that turns on every fix of the installed version. */
const ALL_FIXES = "all";

/** A name the `fix` option accepts: one fix, or `"all"`. */
export type OutputFixName = OutputFix | typeof ALL_FIXES;

const KNOWN_NAMES: ReadonlySet<string> = new Set<string>([...OUTPUT_FIXES, ALL_FIXES]);

function isOutputFixName(value: unknown): value is OutputFixName {
  return typeof value === "string" && KNOWN_NAMES.has(value);
}

/**
 * The fix names as given; fails with `OPTION_FIX_UNKNOWN` for any other value, and for a `fix`
 * option that is no list (`fix: "all"` from JavaScript), which must not be read letter by letter.
 */
export function outputFixNamesOf(values: unknown): readonly OutputFixName[] {
  if (!Array.isArray(values)) {
    throw new OpenAPITypesafeError({
      code: ERROR_CODES.OPTION_FIX_UNKNOWN,
      message:
        'The fix option must be a list of fix names, such as ["all"]. ' +
        `Got ${JSON.stringify(values)}.`,
      details: { unknown: [values], known: [...KNOWN_NAMES] },
    });
  }
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
  return new Set(names.flatMap((name) => (name === ALL_FIXES ? OUTPUT_FIXES : [name])));
}

/** A generator option that a fix works with; without it, the fix changes nothing (ADR-021). */
export interface OutputFixRequirement {
  readonly option:
    | "arrayLength"
    | "dedupeEnums"
    | "enum"
    | "pathParamsAsTypes"
    | "rootTypes"
    | "rootTypesNoSchemaPrefix";
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
  [FIX.ARRAY_LENGTH_TUPLES]: [{ option: "arrayLength", flag: "--array-length" }],
  [FIX.DEDUPE_ENUM_NAMES]: [ENUM, { option: "dedupeEnums", flag: "--dedupe-enums" }],
  [FIX.NULLABLE_ENUMS]: [ENUM],
  [FIX.PATH_PARAM_TYPE_NAMES]: [{ option: "pathParamsAsTypes", flag: "--path-params-as-types" }],
  [FIX.ROOT_TYPE_NUMBERING]: [ROOT_TYPES, NO_SCHEMA_PREFIX],
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
