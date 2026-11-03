import type { components } from "../../../../packages/openapi-typesafe/examples/digital-ocean-api-fix-all.js";

/** The `allof-required` fix (ADR-021): an `allOf` member with only `required`; checked, never run. */

type ARecord = components["schemas"]["domain_record_a"];

/** `name` and `data` are required here, and optional in `domain_record`. */
export function recordLabel(record: ARecord): string {
  return `${record.type} ${record.name.toUpperCase()} ${record.data.length}`;
}

export const minimalRecord: ARecord = { type: "A", name: "www", data: "192.0.2.1" };

// @ts-expect-error `data` is required by the `allOf` member.
export const recordWithoutData: ARecord = { type: "A", name: "www" };
