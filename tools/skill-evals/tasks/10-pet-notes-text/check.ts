import { expect, test } from "vitest";
import { savePetNotes } from "../src/notes";
import { createFakeFetch, createTestClient, empty, onlyRequest } from "./kit";

test("savePetNotes sends the notes as plain text", async () => {
  const fake = createFakeFetch(() => empty(204));

  await savePetNotes(createTestClient(fake), 1, 'Likes "walks"');

  const request = onlyRequest(fake);
  expect(request.method).toBe("PUT");
  expect(request.url.pathname).toBe("/v1/pets/1/notes");
  expect(request.headers.get("Content-Type")).toContain("text/plain");
  expect(request.body).toBe('Likes "walks"');
});

test("savePetNotes throws when the request fails", async () => {
  await expect(
    savePetNotes(createTestClient(createFakeFetch(() => empty(404))), 9, "x"),
  ).rejects.toThrow(Error);
});
