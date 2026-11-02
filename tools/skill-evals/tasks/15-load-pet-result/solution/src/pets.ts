import type { Client } from "openapi-typesafe-fetch";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

const NOT_FOUND_STATUS = 404;

export type PetResult =
  | { kind: "ok"; pet: Pet }
  | { kind: "not-found" }
  | { kind: "failed"; status: number }
  | { kind: "network-error" };

/** Load a pet as a result value; network failures are a result too, never an exception. */
export async function loadPet(client: Client<paths>, petId: number): Promise<PetResult> {
  let result: Awaited<ReturnType<typeof requestPet>>;
  try {
    result = await requestPet(client, petId);
  } catch {
    // fetch rejects only when the request could not be sent (offline, DNS, CORS, abort).
    return { kind: "network-error" };
  }
  const { data, response } = result;
  if (response.status === NOT_FOUND_STATUS) {
    return { kind: "not-found" };
  }
  if (!response.ok || data === undefined) {
    return { kind: "failed", status: response.status };
  }
  return { kind: "ok", pet: data };
}

function requestPet(client: Client<paths>, petId: number) {
  return client.GET("/pets/{petId}", { params: { path: { petId } } });
}
