import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

/** The pets of one owner; `requestId` goes to the `X-Request-Id` header for tracing. */
export async function listOwnerPets(
  client: Client<paths>,
  ownerId: string,
  requestId: string,
): Promise<Pet[]> {
  const { data, response } = await client.GET("/owners/{ownerId}/pets", {
    params: { path: { ownerId }, header: { "X-Request-Id": requestId } },
  });
  if (!response.ok || data === undefined) {
    throw new Error(`Could not list the pets of owner ${ownerId}: HTTP ${response.status}`);
  }
  return data;
}
