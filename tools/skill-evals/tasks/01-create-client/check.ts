import { expect, test } from "vitest";
import { type ApiClient, createApiClient } from "../src/api/client";
import { BASE_URL, createFakeFetch, json, onlyRequest, REX } from "./kit";

test("createApiClient sends requests through fetchImpl to the base URL", async () => {
  const fake = createFakeFetch(() => json(REX));
  const client: ApiClient = createApiClient(BASE_URL, fake.fetch);

  const { data } = await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });

  expect(data?.name).toBe("Rex");
  expect(onlyRequest(fake).url.href).toBe(`${BASE_URL}/pets/1`);
});

test("createApiClient returns a client typed with the generated paths", async () => {
  const client = createApiClient(BASE_URL, createFakeFetch(() => json({})).fetch);

  // @ts-expect-error -- the path is not in the document, so a typed client rejects it
  await client.GET("/no-such-path");

  expect(client).toBeDefined();
});
