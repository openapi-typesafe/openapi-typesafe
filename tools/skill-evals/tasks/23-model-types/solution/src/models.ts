import type { components } from "./api/schema";

type Schemas = components["schemas"];

export type Pet = Schemas["Pet"];
export type NewPet = Schemas["NewPet"];
export type PetPage = Schemas["PetPage"];
export type Problem = Schemas["Problem"];
export type PetStatus = Schemas["PetStatus"];

/** Every pet status; `satisfies` keeps the list in step with the document. */
export const PET_STATUSES = ["available", "adopted"] as const satisfies readonly PetStatus[];
