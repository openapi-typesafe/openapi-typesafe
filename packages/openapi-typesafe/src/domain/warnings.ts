/**
 * Typed warnings. A warning does not stop the run: the output is written and the CLI exits with 0.
 * Each one ends with a stable machine-readable code in parentheses, as the CLI prints errors
 * (`message (CODE)`), so a script or a person can search for it.
 */

/** Every warning code. */
export const WARNING_CODES = {
  QUERYSTRING_NEXT_TO_QUERY: "QUERYSTRING_NEXT_TO_QUERY",
  PATH_TEMPLATES_IDENTICAL: "PATH_TEMPLATES_IDENTICAL",
} as const;

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/** The warning line for people, with its code at the end. */
export function warningText(message: string, code: WarningCode): string {
  return `${message} (${code})`;
}
