import createClient, { type ParseAs, type ParseAsResponse } from "../../src/index.js";

/**
 * Checked with `exactOptionalPropertyTypes` by `exact-optional.test.ts`: there `parseAs?: "text"`
 * has no `undefined` in its type, but a left-out `parseAs` still reads JSON, so the data is the
 * text or the JSON body. Each assignment fails to compile when the type is another one.
 */

type Pet = { id: string };
type Paths = {
  "/pets": {
    get: { responses: { 200: { headers: {}; content: { "application/json": Pet } } } };
  };
};

/** `true` only when the two types are the same. */
type IsSame<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const optionalText: IsSame<ParseAsResponse<Pet, { parseAs?: "text" }>, string | Pet> = true;
export const requiredText: IsSame<ParseAsResponse<Pet, { parseAs: "text" }>, string> = true;
export const optionalAny: IsSame<ParseAsResponse<Pet, { parseAs?: ParseAs }>, Pet> = true;
export const declaredAny: IsSame<
  ParseAsResponse<Pet, { parseAs?: ParseAs | undefined }>,
  Pet
> = true;

export async function readPets(options: { parseAs?: "text" }) {
  const client = createClient<Paths>({ baseUrl: "https://api.example.com" });
  const { data } = await client.GET("/pets", options);
  const isTextOrJSON: IsSame<typeof data, string | Pet | undefined> = true;
  return isTextOrJSON;
}
