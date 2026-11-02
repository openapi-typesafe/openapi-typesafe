import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** Save the notes of a pet; the API takes them as plain text. */
export async function savePetNotes(
  client: Client<paths>,
  petId: number,
  notes: string,
): Promise<void> {
  const { response } = await client.PUT("/pets/{petId}/notes", {
    params: { path: { petId } },
    body: notes,
    headers: { "Content-Type": "text/plain" },
  });
  if (!response.ok) {
    throw new Error(`Could not save the notes of pet ${petId}: HTTP ${response.status}`);
  }
}
