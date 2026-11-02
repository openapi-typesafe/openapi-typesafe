import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** The tag of a pet, if it has one. */
export async function getPetTag(client: Client<paths>, petId: number): Promise<string | undefined> {
  const { data, error } = await client.GET("/pets/{petId}", { params: { path: { petId } } });
  if (error) {
    throw new Error(`Could not load pet ${petId}: ${error.message}`);
  }
  return data.tag;
}
