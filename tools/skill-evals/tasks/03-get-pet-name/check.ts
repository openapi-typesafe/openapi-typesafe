import { expect, test } from "vitest";
import { getPetName } from "../src/pets";
import { BASE_URL, createFakeFetch, createTestClient, empty, json, onlyRequest, REX } from "./kit";

test("getPetName returns the name of the pet", async () => {
  const fake = createFakeFetch(() => json(REX));

  const name = await getPetName(createTestClient(fake), 1);

  expect(name).toBe("Rex");
  expect(onlyRequest(fake).method).toBe("GET");
  expect(onlyRequest(fake).url.href).toBe(`${BASE_URL}/pets/1`);
});

test("getPetName throws on 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No pet" }, 404));

  await expect(getPetName(createTestClient(fake), 9)).rejects.toThrow(Error);
});

test("getPetName throws on a 500 without a body", async () => {
  const fake = createFakeFetch(() => empty(500));

  await expect(getPetName(createTestClient(fake), 1)).rejects.toThrow(Error);
});
