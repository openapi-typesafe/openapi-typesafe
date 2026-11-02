import type { $Read, $Write, Readable, Writable } from "openapi-typesafe-helpers";

/** The marker helpers on the shapes consumers use; checked, never run. */

type Pet = {
  id: $Read<number>;
  password: $Write<string>;
  tags: readonly string[];
  pair: [number, string];
};

export const readPet: Readable<Pet> = { id: 1, tags: ["a"], pair: [1, "a"] };
export const writePet: Writable<Pet> = { password: "secret", tags: [], pair: [2, "b"] };
