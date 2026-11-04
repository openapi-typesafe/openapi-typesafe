import type { components } from "../../../../packages/openapi-typesafe/examples/anyof-properties.js";

/** The `anyof-properties` fix (ADR-021): `anyOf` next to `properties`; checked, never run. */

type Contact = components["schemas"]["Contact"];
type OptionalContact = components["schemas"]["OptionalContact"];

/** The variant narrows by `type`; `name` comes from the sibling `properties`. */
export function contactLabel(contact: Contact): string {
  const target = contact.type === "email" ? contact.address : contact.number;
  return `${contact.name ?? "-"} ${target}`;
}

export const emailContact: Contact = { name: "Ann", type: "email", address: "ann@example.com" };

export const noContact: OptionalContact = null;

// @ts-expect-error a value must match one of the `anyOf` variants.
export const nameOnly: Contact = { name: "Ann" };
