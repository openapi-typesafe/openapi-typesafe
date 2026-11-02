import { expectTypeOf, test } from "vitest";
import type { components } from "../src/api/schema";
import type { GetData, GetPath } from "../src/api/types";

test("GetPath is the union of the paths with a GET operation", () => {
  expectTypeOf<GetPath>().toEqualTypeOf<
    "/health" | "/pets" | "/pets/{petId}" | "/pets/{petId}/photo" | "/owners/{ownerId}/pets"
  >();
});

test("GetData is the success body of the GET operation", () => {
  expectTypeOf<GetData<"/pets/{petId}">>().toEqualTypeOf<components["schemas"]["Pet"]>();
  expectTypeOf<GetData<"/pets">>().toEqualTypeOf<components["schemas"]["PetPage"]>();
  expectTypeOf<GetData<"/owners/{ownerId}/pets">>().toEqualTypeOf<components["schemas"]["Pet"][]>();
});

test("GetData rejects a path without a GET operation", () => {
  // @ts-expect-error -- /auth/login has only POST
  expectTypeOf<GetData<"/auth/login">>().not.toBeAny();
});
