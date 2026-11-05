import type { Logger } from "../application/ports/logger.js";
import {
  type DiscriminatorValueConflict,
  findDiscriminatorValueConflicts,
} from "../domain/openapi/discriminator-conflicts.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";

const DOCS_BASE_URL = "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs";
const DOCS_URL = `${DOCS_BASE_URL}/advanced.md#discriminator-values`;

function listed(values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join(", ");
}

function warningOf(conflict: DiscriminatorValueConflict): string {
  const { member, owner, propertyName, values, allowed, isImplicit } = conflict;
  const rule = isImplicit
    ? "A Discriminator Object without a mapping entry for a schema gives it its schema name as " +
      `the value; add a mapping entry such as ${JSON.stringify(allowed[0])}: "${member}".`
    : "The Discriminator Object maps these values to the schema; map the values it allows.";
  return (
    `${member}: the discriminator "${propertyName}" of ${owner} gives this schema the value ` +
    `${listed(values)}, which its "${propertyName}" property does not allow ` +
    `(${listed(allowed)}), so no value of the schema matches the discriminator. ${rule} ` +
    `See ${DOCS_URL}`
  );
}

/** Warn once per discriminator member whose value its own property does not allow. */
export function warnDiscriminatorValueConflicts(document: unknown, logger: Logger): void {
  for (const conflict of findDiscriminatorValueConflicts(document)) {
    logger.warn(warningText(warningOf(conflict), WARNING_CODES.DISCRIMINATOR_VALUE_NOT_ALLOWED));
  }
}
