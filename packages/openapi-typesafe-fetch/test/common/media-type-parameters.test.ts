import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  JSONLike,
  RequestBodyJSON,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * Only the media type before its parameters says whether a body is JSON, as `JSON_MEDIA_TYPE_RE`
 * reads a `Content-Type`: a `json` in a parameter (`profile=urn:a+json`,
 * `msgtype=application/json`) leaves a `text/plain` or `message/http` error the text.
 */

const PROFILE_JSON = "text/plain; profile=urn:a+json";
const MESSAGE_JSON = "message/http; msgtype=application/json";
type Errors<Content> = { 400: { headers: {}; content: Content } };
type Operation<Responses> = { responses: Responses };
type Mixed = { [PROFILE_JSON]: number; "application/json": boolean };

describe("media type parameters", () => {
  it("ErrorResponse of a media type with a json parameter is a string", () => {
    expectTypeOf<ErrorResponse<Errors<{ [PROFILE_JSON]: number }>>>().toEqualTypeOf<string>();
    expectTypeOf<ErrorResponse<Errors<{ [MESSAGE_JSON]: number }>>>().toEqualTypeOf<string>();
  });

  it("ErrorResponse of a JSON media type with parameters is its schema", () => {
    type Content = {
      "application/json \t;q=1": { code: number };
      "application/problem+json ; charset=utf-8": { title: string };
    };

    expectTypeOf<ErrorResponse<Errors<Content>>>().toEqualTypeOf<
      { code: number } | { title: string }
    >();
  });

  it("ErrorResponse of json text after the subtype is a string", () => {
    expectTypeOf<ErrorResponse<Errors<{ "application/json x": number }>>>().toEqualTypeOf<string>();
    expectTypeOf<ErrorResponse<Errors<{ "/json": number }>>>().toEqualTypeOf<string>();
  });

  it("ErrorResponse of a media range is its schema or a string, not of a range parameter", () => {
    type Range = { "text/*; charset=utf-8": number };
    type RangeParameter = { "text/plain; q=a/*": number };

    expectTypeOf<ErrorResponse<Errors<Range>>>().toEqualTypeOf<number | string>();
    expectTypeOf<ErrorResponse<Errors<RangeParameter>>>().toEqualTypeOf<string>();
  });

  it("JSONLike of a media type with a json parameter leaves it out", () => {
    expectTypeOf<JSONLike<Mixed>>().toEqualTypeOf<boolean>();
  });

  it("SuccessResponseJSON of a media type with a json parameter leaves it out", () => {
    type Success = { 200: { headers: {}; content: Mixed } };
    type WithNoContent = Success & { 204: { headers: {}; content?: never } };

    expectTypeOf<SuccessResponseJSON<Operation<Success>>>().toEqualTypeOf<boolean>();
    expectTypeOf<SuccessResponseJSON<Operation<WithNoContent>>>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("ErrorResponseJSON of a media type with a json parameter leaves it out", () => {
    expectTypeOf<ErrorResponseJSON<Operation<Errors<Mixed>>>>().toEqualTypeOf<boolean>();
  });

  it("ErrorResponseJSON keeps the JSON media types and ranges of every response", () => {
    type Responses = {
      400: { headers: {}; content: { "application/json; charset=utf-8": boolean } };
      404: { headers: {}; content: { "text/*": number; [PROFILE_JSON]: null } };
    };

    expectTypeOf<ErrorResponseJSON<Operation<Responses>>>().toEqualTypeOf<
      boolean | number | string
    >();
  });

  it("SuccessResponseJSON of a content map with an index signature is its schema", () => {
    type Success = { 200: { headers: {}; content: { [media: string]: boolean } } };

    expectTypeOf<SuccessResponseJSON<Operation<Success>>>().toEqualTypeOf<boolean>();
  });

  it("RequestBodyJSON of a media type with a json parameter leaves it out", () => {
    type Body = { requestBody: { content: Mixed } };

    expectTypeOf<RequestBodyJSON<Body>>().toEqualTypeOf<boolean>();
  });

  it("an error with a json parameter in its Content-Type is returned as text", async () => {
    const answer = new Response("1", { status: 400, headers: { "Content-Type": PROFILE_JSON } });
    type Paths = {
      "/count": {
        get: { responses: { 400: { headers: {}; content: { [PROFILE_JSON]: number } } } };
      };
    };
    const client = createClient<Paths>({
      baseUrl: "https://api.example.com",
      fetch: async () => answer,
    });

    const { error } = await client.GET("/count");

    expect(error).toBe("1");
    expectTypeOf(error).toEqualTypeOf<string | undefined>();
  });
});
