import type { Logger } from "../application/ports/logger.js";
import { findUnsupportedFeatures } from "../domain/openapi/unsupported-features.js";

const DOCS_BASE_URL = "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs";
const SUPPORT_DOCS_URL = `${DOCS_BASE_URL}/introduction.md#openapi-3-2-support`;

/**
 * Warn once per use of an OpenAPI 3.2 feature that the generated types leave out, so a missing
 * operation or stream type is never silent (CODING_PRINCIPLES §8.7).
 */
export function warnUnsupportedFeatures(document: unknown, logger: Logger): void {
  for (const { feature, pointer } of findUnsupportedFeatures(document)) {
    logger.warn(
      `${pointer} uses the OpenAPI 3.2 "${feature}" keyword, which is not in the generated ` +
        `types yet. See ${SUPPORT_DOCS_URL}`,
    );
  }
}
