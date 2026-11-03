import createClient, { createPathBasedClient } from "openapi-typesafe-fetch";
import type {
  components,
  operations,
  paths,
} from "../../../../packages/openapi-typesafe/examples/openapi-3-2.js";

/** OpenAPI 3.2 types: a QUERY call, a querystring parameter and an item type; checked, never run. */

const client = createClient<paths>({ baseUrl: "https://api.example.com" });
const pathClient = createPathBasedClient<paths>({ baseUrl: "https://api.example.com" });

export async function searchFlights(origin: string): Promise<string[] | undefined> {
  const { data } = await client.QUERY("/flights/search", { body: { origin } });
  const viaPath = await pathClient["/flights/search"].QUERY({ body: { origin } });
  return data ?? viaPath.data;
}

export async function searchTrips(status: string): Promise<boolean> {
  const { response } = await client.GET("/search", { params: { query: { status, limit: 10 } } });
  return response.ok;
}

type TripStream =
  operations["subscribe-trip"]["responses"][200]["itemContent"]["text/event-stream"];

/** Each event of the SUBSCRIBE stream, typed by its `itemSchema`. */
export function tripEventData(event: TripStream): string {
  return event.data;
}

export function tripUpdateId(update: components["schemas"]["TripUpdate"]): string {
  return update.id;
}
