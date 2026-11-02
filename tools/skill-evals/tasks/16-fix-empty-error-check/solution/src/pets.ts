import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** The tag of a pet, if it has one. Throws for every failed response, with or without a body. */
export async function getPetTag(client: Client<paths>, petId: number): Promise<string | undefined> {
  const { data, error, response } = await client.GET("/pets/{petId}", {
    params: { path: { petId } },
  });
  if (!response.ok || data === undefined) {
    const reason = error === undefined ? "no error body" : error.message;
    throw new Error(`Could not load pet ${petId}: HTTP ${response.status} (${reason})`);
  }
  return data.tag;
}
