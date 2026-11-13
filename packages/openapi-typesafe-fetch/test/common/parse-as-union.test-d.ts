import { describe, expectTypeOf, it } from "vitest";
import createClient, { type ParseAsResponse } from "../../src/index.js";

/**
 * `parseAs` picks how a success body is read, and `undefined` is the default `"json"`. A wrapper
 * that passes its own `parseAs` on gives a union with `undefined`, so each member gives its body.
 */

type Pet = { id: string };
type Operation<Responses> = { responses: Responses };
type Paths = {
  "/pets": {
    get: Operation<{ 200: { headers: {}; content: { "application/json": Pet } } }>;
  };
};

const client = createClient<Paths>({ baseUrl: "https://api.example.com" });

describe("ParseAsResponse", () => {
  it("ParseAsResponse of parseAs text or undefined is a string or the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: "text" | undefined }>>().toEqualTypeOf<
      string | Pet
    >();
  });

  it("ParseAsResponse of parseAs undefined is the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: undefined }>>().toEqualTypeOf<Pet>();
  });

  it("ParseAsResponse of a union of parseAs values is the union of their bodies", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: "blob" | "text" }>>().toEqualTypeOf<
      Blob | string
    >();
  });

  it("ParseAsResponse of an optional parseAs or none is the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs?: "text" }>>().toEqualTypeOf<Pet>();
    expectTypeOf<ParseAsResponse<Pet, { headers: {} }>>().toEqualTypeOf<Pet>();
    expectTypeOf<ParseAsResponse<Pet, undefined>>().toEqualTypeOf<Pet>();
  });

  it("GET with parseAs text or undefined types data as a string or the JSON body", async () => {
    const parseAs = "text" as "text" | undefined;

    const { data } = await client.GET("/pets", { parseAs });

    expectTypeOf(data).toEqualTypeOf<string | Pet | undefined>();
  });
});
