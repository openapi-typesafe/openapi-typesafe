import { expect, test } from "vitest";
import { createRequestIdMiddleware } from "../src/request-id";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

test("the middleware adds a request id to every request", async () => {
  const fake = createFakeFetch(() => json(REX));
  const client = createTestClient(fake);
  let next = 0;
  client.use(createRequestIdMiddleware(() => `id-${++next}`));

  await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });
  await client.GET("/health");

  expect(fake.requests.map((request) => request.headers.get("X-Request-Id"))).toEqual([
    "id-1",
    "id-2",
  ]);
});

test("the middleware keeps a request id the caller set", async () => {
  const fake = createFakeFetch(() => json([REX]));
  const client = createTestClient(fake);
  client.use(createRequestIdMiddleware(() => "generated"));

  await client.GET("/owners/{ownerId}/pets", {
    params: { path: { ownerId: "o-1" }, header: { "X-Request-Id": "from-caller" } },
  });

  expect(fake.requests[0]?.headers.get("X-Request-Id")).toBe("from-caller");
});
