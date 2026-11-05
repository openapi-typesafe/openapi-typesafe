import { WARNING_CODES, warningText } from "../domain/warnings.js";

const DOCS_BASE_URL = "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs";
const DOCS_URL = `${DOCS_BASE_URL}/advanced.md#enum-values-arrays`;

/**
 * The warning for an `--enum-values` array whose schema's location in the generated types admits
 * none or only some of its values (ADR-027): the schema contradicts itself, for example an `allOf`
 * of enums with different values or a discriminator value that the property enum does not list.
 */
export function excludedValuesWarning(name: string, excluded: readonly unknown[]): string {
  const values = excluded.map((value) => JSON.stringify(value)).join(", ");
  return warningText(
    `${name}: the generated type at the location of this enum does not admit ${values}; ` +
      "other keywords of the document exclude these values (an allOf of enums with other " +
      "values, or a discriminator value the enum does not list). The array is typed by its own " +
      "values. " +
      `See ${DOCS_URL}`,
    WARNING_CODES.ENUM_VALUES_EXCLUDED,
  );
}
