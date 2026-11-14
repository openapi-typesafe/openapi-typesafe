import type { GeneratorOptions, LegacyCallbackName, OpenAPITSBaseOptions } from "../types.js";
import { kindOf, optionInvalid, optionsInvalid } from "./option-errors.js";

/**
 * The types of the Node API's options, checked before anything runs. JavaScript callers can pass
 * any value: a non-string `inject` or a Redocly config not made by `createConfig` failed deep in
 * the run with a plain `TypeError`, and a boolean option given as text (`enum: "false"`) turned
 * the option on. `fix` is checked to be a list here and its names where they are read; `cwd`,
 * `localRefRoot` and `remoteRefHosts` are checked where they are read, since their values need
 * more than a type check.
 */

/** The options whose value is a boolean. */
type BooleanOptionName =
  | {
      [Name in keyof OpenAPITSBaseOptions]-?: NonNullable<
        OpenAPITSBaseOptions[Name]
      > extends boolean
        ? Name
        : never;
    }[keyof OpenAPITSBaseOptions]
  | "irCallbacks";

// A record, not a list: a boolean option added to the types does not compile until it is here.
const BOOLEAN_OPTIONS: Readonly<Record<BooleanOptionName, true>> = {
  additionalProperties: true,
  alphabetize: true,
  arrayLength: true,
  binaryAsBlob: true,
  conditionalEnums: true,
  dedupeEnums: true,
  defaultNonNullable: true,
  emptyObjectsUnknown: true,
  enum: true,
  enumValues: true,
  excludeDeprecated: true,
  exportType: true,
  generatePathParams: true,
  immutable: true,
  irCallbacks: true,
  lint: true,
  makePathsEnum: true,
  pathParamsAsTypes: true,
  propertiesRequiredByDefault: true,
  readWriteMarkers: true,
  rootTypes: true,
  rootTypesKeepCasing: true,
  rootTypesNoSchemaPrefix: true,
  silent: true,
};

const CALLBACK_OPTIONS: Readonly<Record<LegacyCallbackName, true>> = {
  transform: true,
  postTransform: true,
  transformProperty: true,
};

const REDOCLY_OPTION = "redocly";

const REDOCLY_EXPECTED =
  "a Redocly 1 config made with createConfig or loadConfig from @redocly/openapi-core 1.26 " +
  "or later";

/** What a Redocly 1 config made before 1.26 is, for the error. */
const OLDER_REDOCLY_KIND = "a config from @redocly/openapi-core before 1.26";

/**
 * The methods of a Redocly 1 `StyleguideConfig` that the loader's checks, lint and bundle call.
 * `getRulesForSpecVersion` came in @redocly/openapi-core 1.26; before, it was
 * `getRulesForOasVersion`, and the run failed with a plain `TypeError`.
 */
const STYLEGUIDE_METHODS = ["extendTypes", "getRulesForSpecVersion", "addProblemToIgnore"];

/** The methods that mark a Redocly 1 `StyleguideConfig` made before 1.26. */
const OLDER_STYLEGUIDE_METHODS = ["extendTypes", "getRulesForOasVersion"];

const FIX_EXPECTED = 'a list of fix names, such as ["all"]';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function hasMethods(value: unknown, names: readonly string[]): boolean {
  return isRecord(value) && names.every((name) => typeof value[name] === "function");
}

/**
 * Whether the value is a Redocly 1 `Config` whose styleguide has these methods, with the
 * `resolve.http` the loader reads. Not `instanceof Config`: the user's own copy of
 * `@redocly/openapi-core` has its own class. A raw config object (`{ extends: [...] }`) and a
 * Redocly 2 config have neither part.
 */
function isRedoclyConfigWith(value: unknown, styleguideMethods: readonly string[]): boolean {
  return (
    isRecord(value) &&
    isRecord(value.resolve) &&
    isRecord(value.resolve.http) &&
    hasMethods(value.styleguide, styleguideMethods)
  );
}

/** What a value is, for the error; an object is named as such ("a object" reads wrong). */
function valueKindOf(value: unknown): string {
  return isRecord(value) && !Array.isArray(value) && !(value instanceof URL)
    ? "an object"
    : kindOf(value);
}

function checkType(
  options: GeneratorOptions,
  names: readonly string[],
  check: { readonly expected: string; readonly isValid: (value: unknown) => boolean },
): void {
  for (const name of names) {
    const value: unknown = Reflect.get(options, name);
    if (value !== undefined && !check.isValid(value)) {
      throw optionInvalid(name, check.expected, valueKindOf(value));
    }
  }
}

/**
 * Fails with `OPTION_INVALID` for a `redocly` option that is no Redocly 1 config the loader can
 * use, naming a config of an older @redocly/openapi-core as such: it looks right but is not.
 */
function checkRedoclyOption(options: GeneratorOptions): void {
  const value: unknown = options.redocly;
  if (value === undefined || isRedoclyConfigWith(value, STYLEGUIDE_METHODS)) {
    return;
  }
  const got = isRedoclyConfigWith(value, OLDER_STYLEGUIDE_METHODS)
    ? OLDER_REDOCLY_KIND
    : valueKindOf(value);
  throw optionInvalid(REDOCLY_OPTION, REDOCLY_EXPECTED, got);
}

/**
 * Fails with `OPTION_INVALID` when the options are not an object (`null`, a string, a list):
 * reading options from them would fail with a plain `TypeError` or ignore them without a word.
 */
function checkOptionsObject(options: unknown): asserts options is GeneratorOptions {
  if (!isRecord(options) || Array.isArray(options)) {
    throw optionsInvalid(valueKindOf(options));
  }
}

/**
 * Fails with `OPTION_INVALID` for options that are no object, or for an option that is set to a
 * value of another type. `undefined` options are no options; the caller gives them as `{}`.
 */
export function checkOptionTypes(options: unknown): asserts options is GeneratorOptions {
  checkOptionsObject(options);
  checkType(options, ["fix"], { expected: FIX_EXPECTED, isValid: Array.isArray });
  checkType(options, Object.keys(BOOLEAN_OPTIONS), {
    expected: "true or false",
    isValid: (value) => typeof value === "boolean",
  });
  checkType(options, Object.keys(CALLBACK_OPTIONS), {
    expected: "a function",
    isValid: (value) => typeof value === "function",
  });
  checkType(options, ["inject"], {
    expected: "a string",
    isValid: (value) => typeof value === "string",
  });
  checkRedoclyOption(options);
}
