import { expect, test } from "vitest";
import { getPetTag } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, REX } from "./kit";

test("getPetTag returns the tag", async () => {
  expect(await getPetTag(createTestClient(createFakeFetch(() => json(REX))), 1)).toBe("dog");
});

test("getPetTag throws an Error with the status for an empty 500", async () => {
  const error = await getPetTag(createTestClient(createFakeFetch(() => empty(500))), 1).catch(
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(TypeError);
  expect((error as Error).message).toContain("500");
});

test("getPetTag throws an Error with the status for a 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No pet" }, 404));

  await expect(getPetTag(createTestClient(fake), 9)).rejects.toThrow("404");
});
