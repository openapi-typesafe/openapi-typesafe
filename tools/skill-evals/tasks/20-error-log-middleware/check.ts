import { expect, test } from "vitest";
import { createErrorLogMiddleware } from "../src/error-log";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

const NOT_FOUND = { code: "not_found", message: "No pet" };

test("the middleware logs a failed response with its schema path", async () => {
  const entries: unknown[] = [];
  const client = createTestClient(createFakeFetch(() => json(NOT_FOUND, 404)));
  client.use(createErrorLogMiddleware((entry) => entries.push(entry)));

  const { error, response } = await client.GET("/pets/{petId}", { params: { path: { petId: 7 } } });

  expect(entries).toEqual([{ method: "GET", schemaPath: "/pets/{petId}", status: 404 }]);
  expect(response.status).toBe(404);
  expect(error).toEqual(NOT_FOUND);
});

test("the middleware does not log successful responses", async () => {
  const entries: unknown[] = [];
  const client = createTestClient(createFakeFetch(() => json(REX)));
  client.use(createErrorLogMiddleware((entry) => entries.push(entry)));

  const { data } = await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });

  expect(entries).toEqual([]);
  expect(data).toEqual(REX);
});
