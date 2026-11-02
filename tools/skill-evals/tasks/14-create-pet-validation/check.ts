import { expect, test } from "vitest";
import { createPetChecked } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, REX } from "./kit";

test("createPetChecked returns the created pet", async () => {
  const result = await createPetChecked(createTestClient(createFakeFetch(() => json(REX, 201))), {
    name: "Rex",
  });

  expect(result).toEqual({ ok: true, pet: REX });
});

test("createPetChecked returns the invalid field names on 400", async () => {
  const invalid = {
    code: "validation_failed",
    fields: [
      { name: "name", message: "must not be empty" },
      { name: "tag", message: "too long" },
    ],
  };
  const fake = createFakeFetch(() => json(invalid, 400));

  const result = await createPetChecked(createTestClient(fake), { name: "" });

  expect(result).toEqual({ ok: false, invalidFields: ["name", "tag"] });
});

test("createPetChecked throws on other failures", async () => {
  await expect(
    createPetChecked(createTestClient(createFakeFetch(() => empty(500))), { name: "Rex" }),
  ).rejects.toThrow(Error);
});
