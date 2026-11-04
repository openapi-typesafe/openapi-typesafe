import type {
  Pet,
  PetStore,
  PetStore_2,
} from "../../../../packages/openapi-typesafe/examples/root-type-numbering.js";

/** The `root-type-numbering` fix (ADR-021): every schema of one root name; checked, never run. */

/** The shared name keeps the later schema, as without the fix. */
export const later: PetStore = { id: 1 };

/** The earlier schema gets the numbered name. */
export const earlier: PetStore_2 = { name: "north" };

export const pet: Pet = { name: "rex" };

// @ts-expect-error the shared name is the later schema, which needs `id`.
export const wrong: PetStore = { name: "north" };
