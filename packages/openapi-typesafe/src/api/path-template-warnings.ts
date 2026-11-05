import type { Logger } from "../application/ports/logger.js";
import { findIdenticalPathTemplates } from "../domain/openapi/path-templates.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";

const DOCS_URL =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/cli.md#pathparamsastypes";
const SPEC_RULE =
  "OpenAPI does not allow this (Paths Object): templated paths with the same hierarchy but " +
  "different templated names MUST NOT exist as they are identical";

/** `"/a"`, `"/a" and "/b"`, `"/a", "/b" and "/c"`. */
function quotedList(urls: readonly string[]): string {
  const quoted = urls.map((url) => `"${url}"`);
  const last = quoted.pop();
  return quoted.length === 0 ? (last ?? "") : `${quoted.join(", ")} and ${last}`;
}

/**
 * Warn once per group of paths that differ only in parameter names, which the spec forbids: a URL
 * cannot tell them apart, and `--path-params-as-types` gives them the same key type.
 */
export function warnIdenticalPathTemplates(document: unknown, logger: Logger): void {
  for (const urls of findIdenticalPathTemplates(document)) {
    const message = `Paths ${quotedList(urls)} differ only in their parameter names. ${SPEC_RULE}`;
    logger.warn(warningText(`${message}. See ${DOCS_URL}`, WARNING_CODES.PATH_TEMPLATES_IDENTICAL));
  }
}
