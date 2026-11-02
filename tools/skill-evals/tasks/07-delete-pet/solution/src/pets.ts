import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

const NOT_FOUND_STATUS = 404;

/** Delete a pet: `true` when deleted, `false` when there is no such pet. */
export async function deletePet(client: Client<paths>, petId: number): Promise<boolean> {
  const { response } = await client.DELETE("/pets/{petId}", { params: { path: { petId } } });
  if (response.ok) {
    return true;
  }
  if (response.status === NOT_FOUND_STATUS) {
    return false;
  }
  throw new Error(`Could not delete pet ${petId}: HTTP ${response.status}`);
}
