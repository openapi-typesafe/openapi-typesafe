import { describe, expectTypeOf, it } from "vitest";
import createClient, { type ParseAs, type ParseAsResponse } from "../../src/index.js";

/**
 * `parseAs` picks how a success body is read, and `undefined` or a left-out `parseAs` is the
 * default `"json"`. A wrapper that passes its own `parseAs` on gives a union with `undefined` or an
 * optional `parseAs`, so each value gives its body; a `parseAs` that may be any value (the declared
 * options type) gives the JSON body, as in openapi-fetch.
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

  it("ParseAsResponse of an optional narrow parseAs is its body or the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs?: "text" }>>().toEqualTypeOf<string | Pet>();
    expectTypeOf<ParseAsResponse<Pet, { parseAs?: "blob" | "text" }>>().toEqualTypeOf<
      Blob | string | Pet
    >();
  });

  it("ParseAsResponse of no parseAs or no options is the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { headers: {} }>>().toEqualTypeOf<Pet>();
    expectTypeOf<ParseAsResponse<Pet, {}>>().toEqualTypeOf<Pet>();
    expectTypeOf<ParseAsResponse<Pet, undefined>>().toEqualTypeOf<Pet>();
  });

  it("ParseAsResponse of a parseAs that may be any value or none is the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs?: ParseAs | undefined }>>().toEqualTypeOf<Pet>();
    expectTypeOf<ParseAsResponse<Pet, { parseAs: ParseAs | undefined }>>().toEqualTypeOf<Pet>();
    expectTypeOf<
      ParseAsResponse<Pet, { parseAs?: ParseAs | undefined } | undefined>
    >().toEqualTypeOf<Pet>();
  });

  it("ParseAsResponse of a required parseAs of any value is every body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: ParseAs }>>().toEqualTypeOf<
      Pet | string | Blob | ArrayBuffer | Response["body"]
    >();
  });

  it("ParseAsResponse of a union of options is the union of their bodies", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: "text" } | { headers: {} }>>().toEqualTypeOf<
      string | Pet
    >();
    expectTypeOf<ParseAsResponse<Pet, { parseAs: "json" }>>().toEqualTypeOf<Pet>();
  });

  it("ParseAsResponse of a required parseAs of any value or no options is every body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: ParseAs } | undefined>>().toEqualTypeOf<
      Pet | string | Blob | ArrayBuffer | Response["body"]
    >();
  });

  it("ParseAsResponse of options or no options is their body or the JSON body", () => {
    expectTypeOf<ParseAsResponse<Pet, { parseAs: "text" } | undefined>>().toEqualTypeOf<
      string | Pet
    >();
  });

  it("ParseAsResponse of any options is any", () => {
    // biome-ignore lint/suspicious/noExplicitAny: the case under test
    expectTypeOf<ParseAsResponse<Pet, any>>().toBeAny();
  });

  it("GET with an optional parseAs text types data as a string or the JSON body", async () => {
    const options: { parseAs?: "text" } = {};

    const { data } = await client.GET("/pets", options);

    expectTypeOf(data).toEqualTypeOf<string | Pet | undefined>();
  });

  it("GET with parseAs text or undefined types data as a string or the JSON body", async () => {
    const parseAs = "text" as "text" | undefined;

    const { data } = await client.GET("/pets", { parseAs });

    expectTypeOf(data).toEqualTypeOf<string | Pet | undefined>();
  });
});
