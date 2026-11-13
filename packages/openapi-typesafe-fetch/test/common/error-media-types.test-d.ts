import { describe, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  GetResponseContent,
  SuccessResponse,
} from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * The error types describe what the client returns. It reads an error body by its media type: a
 * JSON one (`json` or a `+json` suffix, with parameters, in any case) is parsed, any other is the
 * text. So a `text/plain` error with an `integer` or `boolean` schema is a `string`, and a media
 * range (`text/*` too, as `text/json` parses) is the schema or a `string`. Success
 * data keeps its schema: the default `parseAs: "json"` parses whatever the media type.
 */

type Problem = { title: string };
type Pet = { id: string };
type Response<Content> = { headers: {}; content: Content };
type Operation<Responses> = { responses: Responses };

type Paths = {
  "/flag": {
    get: Operation<{
      200: Response<{ "application/json": Pet }>;
      503: Response<{ "text/plain": boolean }>;
    }>;
  };
  "/count": {
    get: Operation<{
      200: Response<{ "text/plain": number }>;
      429: Response<{ "text/plain": number }>;
    }>;
  };
};

const client = createClient<Paths>({ baseUrl: "https://api.example.com" });

describe("ErrorResponse by media type", () => {
  it("ErrorResponse of a text/plain integer or boolean error is a string", () => {
    type Errors = {
      429: Response<{ "text/plain": number }>;
      503: Response<{ "text/plain; charset=utf-8": boolean }>;
    };

    expectTypeOf<ErrorResponse<Errors>>().toEqualTypeOf<string>();
  });

  it("ErrorResponse of JSON media types is their schemas, in any case and with parameters", () => {
    type Errors = {
      400: Response<{ "application/problem+json": Problem }>;
      404: Response<{ "Application/JSON; charset=UTF-8": { code: number } }>;
    };

    expectTypeOf<ErrorResponse<Errors>>().toEqualTypeOf<Problem | { code: number }>();
  });

  it("ErrorResponse of the media ranges that may hold JSON is the schema or a string", () => {
    type AnyType = { 500: Response<{ "*/*": { code: number } }> };
    type AnyApplication = { 500: Response<{ "application/*": { code: number } }> };

    expectTypeOf<ErrorResponse<AnyType>>().toEqualTypeOf<{ code: number } | string>();
    expectTypeOf<ErrorResponse<AnyApplication>>().toEqualTypeOf<{ code: number } | string>();
  });

  it("ErrorResponse of a text media range is the schema or a string, as text/json parses", () => {
    type Errors = { 500: Response<{ "text/*": { code: number } }> };
    type WithParameters = { 500: Response<{ "text/*; charset=utf-8": { code: number } }> };

    expectTypeOf<ErrorResponse<Errors>>().toEqualTypeOf<{ code: number } | string>();
    expectTypeOf<ErrorResponse<WithParameters>>().toEqualTypeOf<{ code: number } | string>();
  });

  it("ErrorResponse of a JSON and a text body of one error is the schema or a string", () => {
    type Errors = {
      400: Response<{ "application/json": { code: number }; "text/plain": number }>;
    };

    expectTypeOf<ErrorResponse<Errors>>().toEqualTypeOf<{ code: number } | string>();
    expectTypeOf<ErrorResponse<Errors, "application/json">>().toEqualTypeOf<{ code: number }>();
    expectTypeOf<ErrorResponse<Errors, "text/plain">>().toEqualTypeOf<string>();
  });

  it("ErrorResponse of a content map keyed by any string is the schema or a string", () => {
    type Errors = { 500: Response<Record<string, { code: number }>> };

    expectTypeOf<ErrorResponse<Errors>>().toEqualTypeOf<{ code: number } | string>();
  });

  it("ErrorResponseJSON of a text/plain integer error is a string", () => {
    type Errors = { 429: Response<{ "text/plain": number }> };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<string>();
  });

  it("GetResponseContent of a text/plain integer is a number for a success only", () => {
    type Responses = {
      200: Response<{ "text/plain": number }>;
      429: Response<{ "text/plain": number }>;
    };

    expectTypeOf<GetResponseContent<Responses, "text/plain", 200>>().toEqualTypeOf<number>();
    expectTypeOf<GetResponseContent<Responses, "text/plain", 429>>().toEqualTypeOf<string>();
  });

  it("SuccessResponse of a text/plain integer stays its schema", () => {
    type Responses = { 200: Response<{ "text/plain": number }> };

    expectTypeOf<SuccessResponse<Responses>>().toEqualTypeOf<number>();
  });
});

describe("a client with text errors", () => {
  it("GET of a text/plain boolean error types the error as a string", async () => {
    const { data, error } = await client.GET("/flag");

    expectTypeOf(data).toEqualTypeOf<Pet | undefined>();
    expectTypeOf(error).toEqualTypeOf<string | undefined>();
  });

  it("GET of a text/plain integer error and success types a string error and number data", async () => {
    const { data, error } = await client.GET("/count");

    expectTypeOf(data).toEqualTypeOf<number | undefined>();
    expectTypeOf(error).toEqualTypeOf<string | undefined>();
  });
});
