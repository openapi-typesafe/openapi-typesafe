import type { GeneratorOptions, LegacyCallbackName, OpenAPITSBaseOptions } from "../types.js";
import { kindOf, optionInvalid } from "./option-errors.js";

/**
 * The types of the Node API's options, checked before anything runs. JavaScript callers can pass
 * any value: a non-string `inject` or a Redocly config not made by `createConfig` failed deep in
 * the run with a plain `TypeError`, and a boolean option given as text (`enum: "false"`) turned
 * the option on. `cwd`, `localRefRoot`, `remoteRefHosts` and `fix` are checked where they are
 * read, since their values need more than a type check.
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

const REDOCLY_EXPECTED =
  "a Redocly 1 config made with createConfig or loadConfig from @redocly/openapi-core";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/**
 * Whether the value has the parts of a Redocly 1 `Config` the loader reads: `resolve.http` and
 * `styleguide.extendTypes`. Not `instanceof Config`: the user's own copy of
 * `@redocly/openapi-core` has its own class. A raw config object (`{ extends: [...] }`) and a
 * Redocly 2 config have neither.
 */
function isRedoclyConfig(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.resolve) &&
    isRecord(value.resolve.http) &&
    isRecord(value.styleguide) &&
    typeof value.styleguide.extendTypes === "function"
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

/** Fails with `OPTION_INVALID` for an option that is set to a value of another type. */
export function checkOptionTypes(options: GeneratorOptions): void {
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
  checkType(options, ["redocly"], { expected: REDOCLY_EXPECTED, isValid: isRedoclyConfig });
}
