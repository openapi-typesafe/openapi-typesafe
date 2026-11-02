import { expect, test } from "vitest";
import { createPet } from "../src/pets";
import { createFakeFetch, createTestClient, json, onlyRequest, REX } from "./kit";

test("createPet posts the input as JSON and returns the created pet", async () => {
  const fake = createFakeFetch(() => json(REX, 201));

  const pet = await createPet(createTestClient(fake), { name: "Rex", tag: "dog" });

  expect(pet).toEqual(REX);
  const request = onlyRequest(fake);
  expect(request.method).toBe("POST");
  expect(request.url.pathname).toBe("/v1/pets");
  expect(request.headers.get("Content-Type")).toContain("application/json");
  expect(JSON.parse(request.body)).toEqual({ name: "Rex", tag: "dog" });
});

test("createPet throws on a validation error", async () => {
  const invalid = { code: "validation_failed", fields: [{ name: "name", message: "empty" }] };
  const fake = createFakeFetch(() => json(invalid, 400));

  await expect(createPet(createTestClient(fake), { name: "" })).rejects.toThrow(Error);
});
