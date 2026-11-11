import { ERROR_CODES, OpenAPITypesafeError } from "../domain/errors.js";

/** The `OPTION_INVALID` errors of the Node API's options, checked before anything loads. */

/** What a value is, for the error; a URL is named by its protocol only, as it may hold secrets. */
export function kindOf(value: unknown): string {
  if (value instanceof URL) {
    return `a ${value.protocol} URL`;
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  return value === null ? "null" : `a ${typeof value}`;
}

export function optionInvalid(option: string, expected: string, got: string): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.OPTION_INVALID,
    message: `The ${option} option must be ${expected}; got ${got}.`,
    details: { option },
  });
}
