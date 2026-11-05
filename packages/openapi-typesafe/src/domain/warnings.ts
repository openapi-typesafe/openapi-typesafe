/**
 * Typed warnings. A warning does not stop the run: the output is written and the CLI exits with 0.
 * Each one ends with a stable machine-readable code in parentheses, as the CLI prints errors
 * (`message (CODE)`), so a script or a person can search for it.
 */

/** Every warning code. */
export const WARNING_CODES = {
  DISCRIMINATOR_VALUE_NOT_ALLOWED: "DISCRIMINATOR_VALUE_NOT_ALLOWED",
  ENUM_VALUES_EXCLUDED: "ENUM_VALUES_EXCLUDED",
  PATH_TEMPLATES_IDENTICAL: "PATH_TEMPLATES_IDENTICAL",
  QUERYSTRING_NEXT_TO_QUERY: "QUERYSTRING_NEXT_TO_QUERY",
} as const;

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/** The warning line for people, with its code at the end. */
export function warningText(message: string, code: WarningCode): string {
  return `${message} (${code})`;
}
