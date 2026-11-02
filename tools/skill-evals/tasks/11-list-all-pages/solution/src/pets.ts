import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

/** Every pet, read page by page through the cursor. */
export async function listAllPets(client: Client<paths>, tag?: string): Promise<Pet[]> {
  const pets: Pet[] = [];
  let cursor: number | undefined;
  do {
    const query = {
      ...(tag === undefined ? {} : { tag }),
      ...(cursor === undefined ? {} : { cursor }),
    };
    const { data, response } = await client.GET("/pets", { params: { query } });
    if (!response.ok || data === undefined) {
      throw new Error(`Could not list pets: HTTP ${response.status}`);
    }
    pets.push(...data.items);
    cursor = data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return pets;
}
