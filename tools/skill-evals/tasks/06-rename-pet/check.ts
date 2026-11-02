import { expect, test } from "vitest";
import { renamePet } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, onlyRequest, REX } from "./kit";

test("renamePet patches only the name", async () => {
  const fake = createFakeFetch(() => json({ ...REX, name: "Max" }));

  const pet = await renamePet(createTestClient(fake), 1, "Max");

  expect(pet.name).toBe("Max");
  const request = onlyRequest(fake);
  expect(request.method).toBe("PATCH");
  expect(request.url.pathname).toBe("/v1/pets/1");
  expect(JSON.parse(request.body)).toEqual({ name: "Max" });
});

test("renamePet throws on 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No pet" }, 404));

  await expect(renamePet(createTestClient(fake), 9, "Max")).rejects.toThrow(Error);
});

test("renamePet throws on a 502 without a body", async () => {
  await expect(
    renamePet(createTestClient(createFakeFetch(() => empty(502))), 1, "Max"),
  ).rejects.toThrow(Error);
});
