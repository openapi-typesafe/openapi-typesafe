import { expect, test } from "vitest";
import { getPetPhoto } from "../src/photos";
import { createFakeFetch, createTestClient, json, onlyRequest } from "./kit";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

test("getPetPhoto returns the photo bytes as a Blob", async () => {
  const fake = createFakeFetch(
    () => new Response(PNG_BYTES, { status: 200, headers: { "Content-Type": "image/png" } }),
  );

  const photo = await getPetPhoto(createTestClient(fake), 1);

  expect(photo).toBeInstanceOf(Blob);
  expect(new Uint8Array(await photo.arrayBuffer())).toEqual(PNG_BYTES);
  expect(onlyRequest(fake).url.pathname).toBe("/v1/pets/1/photo");
});

test("getPetPhoto throws on 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No photo" }, 404));

  await expect(getPetPhoto(createTestClient(fake), 9)).rejects.toThrow(Error);
});
