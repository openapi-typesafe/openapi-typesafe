import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** The PNG photo of a pet. */
export async function getPetPhoto(client: Client<paths>, petId: number): Promise<Blob> {
  const { data, response } = await client.GET("/pets/{petId}/photo", {
    params: { path: { petId } },
    parseAs: "blob",
  });
  if (!response.ok || data === undefined) {
    throw new Error(`Could not load the photo of pet ${petId}: HTTP ${response.status}`);
  }
  return data;
}
