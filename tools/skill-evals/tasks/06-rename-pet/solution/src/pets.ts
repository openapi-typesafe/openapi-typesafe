import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

/** Rename a pet and return the updated pet. */
export async function renamePet(client: Client<paths>, petId: number, name: string): Promise<Pet> {
  const { data, response } = await client.PATCH("/pets/{petId}", {
    params: { path: { petId } },
    body: { name },
  });
  if (!response.ok || data === undefined) {
    throw new Error(`Could not rename pet ${petId}: HTTP ${response.status}`);
  }
  return data;
}
