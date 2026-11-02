import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** The names of the pets on the first page that matches the filter. */
export async function listPetNames(
  client: Client<paths>,
  filter: { limit?: number; tag?: string },
): Promise<string[]> {
  const { data, response } = await client.GET("/pets", { params: { query: filter } });
  if (!response.ok || data === undefined) {
    throw new Error(`Could not list pets: HTTP ${response.status}`);
  }
  return data.items.map((pet) => pet.name);
}
