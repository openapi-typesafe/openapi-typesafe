import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

const NOT_FOUND_STATUS = 404;

/** The pet, or `null` when there is no such pet. Throws on any other failure. */
export async function findPet(client: Client<paths>, petId: number): Promise<Pet | null> {
  const { data, response } = await client.GET("/pets/{petId}", { params: { path: { petId } } });
  if (response.status === NOT_FOUND_STATUS) {
    return null;
  }
  if (!response.ok || data === undefined) {
    throw new Error(`Could not load pet ${petId}: HTTP ${response.status}`);
  }
  return data;
}
