import { expect, test } from "vitest";
import { deletePet } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, onlyRequest } from "./kit";

test("deletePet returns true on 204", async () => {
  const fake = createFakeFetch(() => empty(204));

  expect(await deletePet(createTestClient(fake), 1)).toBe(true);
  expect(onlyRequest(fake).method).toBe("DELETE");
  expect(onlyRequest(fake).url.pathname).toBe("/v1/pets/1");
});

test("deletePet returns false on 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No pet" }, 404));

  expect(await deletePet(createTestClient(fake), 9)).toBe(false);
});

test("deletePet throws on a 500 without a body", async () => {
  await expect(deletePet(createTestClient(createFakeFetch(() => empty(500))), 1)).rejects.toThrow(
    Error,
  );
});
