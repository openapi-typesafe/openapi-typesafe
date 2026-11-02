import { expect, test } from "vitest";
import { withHeader } from "../src/headers";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

test("withHeader adds the header only while run is running", async () => {
  const fake = createFakeFetch(() => json(REX));
  const client = createTestClient(fake);

  const result = await withHeader(client, "X-Debug", "1", async () => {
    await client.GET("/health");
    return "done";
  });
  await client.GET("/health");

  expect(result).toBe("done");
  expect(fake.requests.map((request) => request.headers.get("X-Debug"))).toEqual(["1", null]);
});

test("withHeader removes the header when run throws", async () => {
  const fake = createFakeFetch(() => json(REX));
  const client = createTestClient(fake);

  await expect(
    withHeader(client, "X-Debug", "1", async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  await client.GET("/health");

  expect(fake.requests[0]?.headers.get("X-Debug")).toBeNull();
});
