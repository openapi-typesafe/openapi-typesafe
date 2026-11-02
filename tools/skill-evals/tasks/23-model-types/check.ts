import { expect, expectTypeOf, test } from "vitest";
import type { components } from "../src/api/schema";
import {
  type NewPet,
  PET_STATUSES,
  type Pet,
  type PetPage,
  type PetStatus,
  type Problem,
} from "../src/models";

type Schemas = components["schemas"];

test("the model types are the generated schemas", () => {
  expectTypeOf<Pet>().toEqualTypeOf<Schemas["Pet"]>();
  expectTypeOf<NewPet>().toEqualTypeOf<Schemas["NewPet"]>();
  expectTypeOf<PetPage>().toEqualTypeOf<Schemas["PetPage"]>();
  expectTypeOf<Problem>().toEqualTypeOf<Schemas["Problem"]>();
  expectTypeOf<PetStatus>().toEqualTypeOf<Schemas["PetStatus"]>();
});

test("PET_STATUSES lists every status", () => {
  expect([...PET_STATUSES].sort()).toEqual(["adopted", "available"]);
});
