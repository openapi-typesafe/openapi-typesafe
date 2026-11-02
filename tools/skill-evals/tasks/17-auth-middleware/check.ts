import { expect, test } from "vitest";
import { createAuthMiddleware } from "../src/auth";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

function setUp() {
  const fake = createFakeFetch(() => json(REX));
  const client = createTestClient(fake);
  let tokenNumber = 0;
  client.use(createAuthMiddleware(async () => `token-${++tokenNumber}`));
  return { fake, client };
}

test("the middleware adds a fresh bearer token to private endpoints", async () => {
  const { fake, client } = setUp();

  await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });
  await client.GET("/pets");

  expect(fake.requests.map((request) => request.headers.get("Authorization"))).toEqual([
    "Bearer token-1",
    "Bearer token-2",
  ]);
});

test("the middleware leaves public endpoints alone", async () => {
  const { fake, client } = setUp();

  await client.POST("/auth/login", { body: { username: "a", password: "b" } });
  await client.GET("/health");

  expect(fake.requests.map((request) => request.headers.get("Authorization"))).toEqual([
    null,
    null,
  ]);
});
