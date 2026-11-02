import { expect, test } from "vitest";
import { ApiError } from "../src/errors";
import { getHealthStatus } from "../src/health";
import { createFakeFetch, createTestClient, empty, json } from "./kit";

test("getHealthStatus returns the status", async () => {
  const fake = createFakeFetch(() => json({ status: "degraded" }));

  expect(await getHealthStatus(createTestClient(fake))).toBe("degraded");
});

test("getHealthStatus throws ApiError with the status of a failed response", async () => {
  const fake = createFakeFetch(() => json({ code: "down", message: "Maintenance" }, 503));

  const error = await getHealthStatus(createTestClient(fake)).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(503);
});

test("getHealthStatus throws ApiError for an empty error response", async () => {
  const error = await getHealthStatus(createTestClient(createFakeFetch(() => empty(502)))).catch(
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(502);
});
