import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];
type NewPet = components["schemas"]["NewPet"];

const VALIDATION_FAILED_STATUS = 400;

/** Create a pet; a validation failure is a result, not an exception. */
export async function createPetChecked(
  client: Client<paths>,
  input: NewPet,
): Promise<{ ok: true; pet: Pet } | { ok: false; invalidFields: string[] }> {
  const { data, error, response } = await client.POST("/pets", { body: input });
  if (response.status === VALIDATION_FAILED_STATUS && error !== undefined) {
    return { ok: false, invalidFields: error.fields.map((field) => field.name) };
  }
  if (!response.ok || data === undefined) {
    throw new Error(`Could not create the pet: HTTP ${response.status}`);
  }
  return { ok: true, pet: data };
}
