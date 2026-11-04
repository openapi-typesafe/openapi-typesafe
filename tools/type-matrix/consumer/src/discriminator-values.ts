import type { components } from "../../../../packages/openapi-typesafe/examples/discriminator-values.js";

/** The `discriminator-values` fix (ADR-021): one mapped value per schema; checked, never run. */

type Cat = components["schemas"]["Cat"];
type Shelter = components["schemas"]["Shelter"];

export const cat: Cat = { kind: "cat", meows: true };

/** The union narrows by the mapped value, which a value of the schema can have. */
export function soundOf(shelter: Shelter): string {
  return shelter.resident.kind === "cat"
    ? `meows: ${shelter.resident.meows ?? false}`
    : `barks: ${shelter.resident.barks ?? false}`;
}

// @ts-expect-error the schema name is not the value the mapping gives.
export const named: Cat = { kind: "Cat" };
