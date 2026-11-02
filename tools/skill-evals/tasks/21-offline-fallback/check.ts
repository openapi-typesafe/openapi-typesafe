import createClient from "openapi-typesafe-fetch";
import { expect, test } from "vitest";
import type { paths } from "../src/api/schema";
import { offlineMiddleware } from "../src/offline";
import { BASE_URL, createFakeFetch, createTestClient, failingFetch, json, REX } from "./kit";

test("a network failure resolves as a 503 offline problem", async () => {
  const client = createClient<paths>({ baseUrl: BASE_URL, fetch: failingFetch });
  client.use(offlineMiddleware);

  const { error, response } = await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });

  expect(response.status).toBe(503);
  expect(error).toEqual({ code: "offline", message: "The network is unavailable" });
});

test("successful calls are not changed", async () => {
  const client = createTestClient(createFakeFetch(() => json(REX)));
  client.use(offlineMiddleware);

  const { data } = await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });

  expect(data).toEqual(REX);
});
