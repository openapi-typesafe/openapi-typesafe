import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** The name of a pet. Throws when the pet cannot be loaded. */
export async function getPetName(client: Client<paths>, petId: number): Promise<string> {
  const { data, response } = await client.GET("/pets/{petId}", { params: { path: { petId } } });
  if (!response.ok || data === undefined) {
    throw new Error(`Could not load pet ${petId}: HTTP ${response.status}`);
  }
  return data.name;
}
