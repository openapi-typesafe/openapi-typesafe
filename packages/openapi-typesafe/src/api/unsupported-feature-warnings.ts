import type { Logger } from "../application/ports/logger.js";
import {
  findUnsupportedFeatures,
  UnsupportedFeature,
} from "../domain/openapi/unsupported-features.js";
import { WARNING_CODES, type WarningCode, warningText } from "../domain/warnings.js";

const DOCS_BASE_URL = "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs";
const SUPPORT_DOCS_URL = `${DOCS_BASE_URL}/introduction.md#openapi-3-2-support`;

/** Why each feature is not in the generated types. */
const REASONS: Readonly<Record<UnsupportedFeature, string>> = {
  [UnsupportedFeature.QUERYSTRING_NEXT_TO_QUERY]:
    'is an "in: querystring" parameter next to "in: query" parameters, which OpenAPI 3.2 does ' +
    "not allow; the query parameters keep their types and this parameter is not in the " +
    "generated types",
};

/** The warning code of each feature. */
const CODES: Readonly<Record<UnsupportedFeature, WarningCode>> = {
  [UnsupportedFeature.QUERYSTRING_NEXT_TO_QUERY]: WARNING_CODES.QUERYSTRING_NEXT_TO_QUERY,
};

/**
 * Warn once per use of an OpenAPI 3.2 feature that the generated types leave out, so a missing
 * parameter is never silent (CODING_PRINCIPLES §8.7).
 */
export function warnUnsupportedFeatures(document: unknown, logger: Logger): void {
  for (const { feature, pointer } of findUnsupportedFeatures(document)) {
    const message = `${pointer} ${REASONS[feature]}. See ${SUPPORT_DOCS_URL}`;
    logger.warn(warningText(message, CODES[feature]));
  }
}
