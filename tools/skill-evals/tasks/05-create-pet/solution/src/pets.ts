import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

/** Create a pet and return it as the API stored it. */
export async function createPet(
  client: Client<paths>,
  input: { name: string; tag?: string },
): Promise<Pet> {
  const { data, response } = await client.POST("/pets", { body: input });
  if (!response.ok || data === undefined) {
    throw new Error(`Could not create the pet: HTTP ${response.status}`);
  }
  return data;
}
