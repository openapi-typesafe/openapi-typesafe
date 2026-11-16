import type {
  EnumInheritanceReport,
  NotInheritedEnumValues,
} from "../application/transform/schema/schema-context.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import { defaultLogger } from "./default-ports.js";
import type { RunContext } from "./run-context.js";

const DOCS_URL =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/advanced.md#inherited-enums";

/** The warning for enum values that an `allOf` base's enum at the same place does not list. */
export function notInheritedValuesWarning(found: NotInheritedEnumValues): string {
  const values = found.values.map((value) => JSON.stringify(value)).join(", ");
  const result = found.hasCommonValues
    ? "The type lists the values both enums list."
    : "The two enums list no common value, so the type is never.";
  return warningText(
    `${found.path}: the enum lists ${values}, which the enum of ${found.base} does not; an allOf ` +
      `intersects the two, so no value of the schema can be one of these. ${result} ` +
      `See ${DOCS_URL}`,
    WARNING_CODES.ENUM_VALUES_NOT_INHERITED,
  );
}

/**
 * Reports each enum whose values an `allOf` base never admits, once per pass and place: a schema
 * typed again (a member of a discriminated union, a `$ref` into it) gives the same finding.
 */
export function enumInheritanceReport(ctx: RunContext): EnumInheritanceReport {
  return {
    reportNotInherited(found) {
      const key = JSON.stringify([found.path, found.base]);
      ctx.reportedNotInheritedEnums ??= new Set();
      if (ctx.reportedNotInheritedEnums.has(key)) {
        return;
      }
      ctx.reportedNotInheritedEnums.add(key);
      (ctx.logger ?? defaultLogger(ctx.silent)).warn(notInheritedValuesWarning(found));
    },
  };
}
