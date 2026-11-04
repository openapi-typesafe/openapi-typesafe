import type { components } from "../../../../packages/openapi-typesafe/examples/unevaluated-properties.js";

/** The `unevaluated-properties` fix (ADR-021): keys no keyword declares; checked, never run. */

type Labels = components["schemas"]["Labels"];
type Annotated = components["schemas"]["Annotated"];

export const labels: Labels = { team: "core", tier: "gold" };

/** Declared keys keep their types; any other key reads the index type. */
export function describeAnnotated(value: Annotated, key: string): string {
  const extra: string | number | undefined = value[key];
  return `${value.id} ${value.version ?? 0} ${extra ?? "-"}`;
}

export const annotated: Annotated = { id: "r1", version: 2, kind: "annotated", owner: "ann" };

// @ts-expect-error a key no keyword declares must be a string.
export const wrongLabel: Labels = { team: 1 };

// @ts-expect-error `id` is still required by the referenced schema.
export const missingId: Annotated = { owner: "ann" };
