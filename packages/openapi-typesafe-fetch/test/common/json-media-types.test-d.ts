import { describe, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  GetResponseContent,
  JSONLike,
  RequestBodyJSON,
  SuccessResponse,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * The response types describe what the client returns. It parses every JSON body (`json` or a
 * `+json` suffix, with or without parameters, and the wildcards that may hold JSON), so each one
 * gives its schema whatever the media types asked for. It returns any other error body as text,
 * and the default `parseAs: "json"` rejects any other success body. The JSON helpers matched only
 * `${string}/json`, so a problem+json error was left out of `error`.
 */

type Problem = { title: string };
type Pet = { id: string };
type Response<Content> = { headers: {}; content: Content };
type Operation<Responses> = { responses: Responses };

type JSONClientPaths = {
  "/problem": {
    get: Operation<{
      200: Response<{ "application/json": Pet }>;
      400: Response<{ "application/problem+json": Problem }>;
    }>;
  };
  "/html-error": {
    get: Operation<{
      200: Response<{ "application/json": Pet }>;
      500: Response<{ "text/html": string }>;
    }>;
  };
  "/text": {
    get: Operation<{ 200: Response<{ "text/plain": string }> }>;
  };
};

function jsonClient() {
  return createClient<JSONClientPaths, `${string}/json`>({ baseUrl: "https://api.example.com" });
}

describe("JSON media types", () => {
  it("ErrorResponseJSON of a problem+json error is its schema", () => {
    type Errors = { 400: Response<{ "application/problem+json": Problem }> };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<Problem>();
  });

  it("ErrorResponseJSON of a json and a problem+json error is the union", () => {
    type Errors = {
      400: Response<{ "application/problem+json": Problem }>;
      404: Response<{ "application/json": { code: number } }>;
    };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<
      Problem | { code: number }
    >();
  });

  it("SuccessResponseJSON of a vnd.api+json success is its schema", () => {
    type Successes = { 200: Response<{ "application/vnd.api+json": Pet }> };

    expectTypeOf<SuccessResponseJSON<Operation<Successes>>>().toEqualTypeOf<Pet>();
  });

  it("SuccessResponseJSON of a JSON media type with parameters is its schema", () => {
    type Successes = {
      200: Response<{ "application/json; charset=utf-8": Pet }>;
      201: Response<{ "application/json;charset=UTF-8": { created: true } }>;
      202: Response<{ "application/problem+json ; charset=utf-8": Problem }>;
    };

    expectTypeOf<SuccessResponseJSON<Operation<Successes>>>().toEqualTypeOf<
      Pet | { created: true } | Problem
    >();
  });

  it("SuccessResponseJSON of a JSON media type in upper case is its schema", () => {
    type Successes = { 200: Response<{ "Application/JSON": Pet }> };

    expectTypeOf<SuccessResponseJSON<Operation<Successes>>>().toEqualTypeOf<Pet>();
  });

  it("SuccessResponseJSON of the wildcards that may hold JSON is their schema", () => {
    type Successes = {
      200: Response<{ "*/*": Pet }>;
      201: Response<{ "application/*": Problem }>;
    };

    expectTypeOf<SuccessResponseJSON<Operation<Successes>>>().toEqualTypeOf<Pet | Problem>();
  });

  it("SuccessResponseJSON of a text wildcard or line-delimited JSON is never", () => {
    type Successes = {
      200: Response<{ "text/*": string }>;
      201: Response<{ "application/x-ndjson": Pet }>;
      202: Response<{ "application/json-seq": Pet }>;
    };

    expectTypeOf<SuccessResponseJSON<Operation<Successes>>>().toBeNever();
  });

  it("ErrorResponseJSON of one error with a json and a problem+json body is the union", () => {
    type Errors = {
      400: Response<{ "application/json": { code: number }; "application/problem+json": Problem }>;
    };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<
      { code: number } | Problem
    >();
  });

  it("GetResponseContent of a text success and a text error is a string for the error only", () => {
    type Responses = {
      200: Response<{ "text/plain": "ok" }>;
      404: Response<{ "text/plain": "missing" }>;
    };

    expectTypeOf<GetResponseContent<Responses, "application/json", 200>>().toBeNever();
    expectTypeOf<GetResponseContent<Responses, "application/json", 404>>().toEqualTypeOf<string>();
  });

  it("ErrorResponseJSON of a body that is not JSON is a string", () => {
    type Errors = {
      404: Response<{ "application/xml": { code: number } }>;
      500: Response<{ "text/html": string }>;
    };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<string>();
  });

  it("ErrorResponseJSON of a JSON 404 and an HTML 500 is the schema or a string", () => {
    type Errors = {
      404: Response<{ "application/json": { code: number } }>;
      500: Response<{ "text/html": string }>;
    };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<{ code: number } | string>();
  });

  it("ErrorResponseJSON of 1XX and 3XX text bodies is a string", () => {
    type Errors = {
      101: Response<{ "text/plain": "switching" }>;
      302: Response<{ "text/plain": "moved" }>;
    };

    expectTypeOf<ErrorResponseJSON<Operation<Errors>>>().toEqualTypeOf<string>();
  });

  it("ErrorResponseJSON of a text default next to a 2XX is a string", () => {
    type Responses = {
      200: Response<{ "application/json": Pet }>;
      default: Response<{ "text/html": string }>;
    };

    expectTypeOf<SuccessResponseJSON<Operation<Responses>>>().toEqualTypeOf<Pet>();
    expectTypeOf<ErrorResponseJSON<Operation<Responses>>>().toEqualTypeOf<string>();
  });

  it("SuccessResponseJSON of a text default without a 2XX is never", () => {
    type Responses = { default: Response<{ "text/plain": string }> };

    expectTypeOf<SuccessResponseJSON<Operation<Responses>>>().toBeNever();
  });

  it("SuccessResponseJSON of a 204 without content is undefined", () => {
    type Responses = { 204: { headers: {}; content?: never } };

    expectTypeOf<SuccessResponseJSON<Operation<Responses>>>().toEqualTypeOf<undefined>();
  });

  it("SuccessResponse picks a declared body that is not JSON by its media type", () => {
    type Responses = {
      200: Response<{ "text/plain": "text"; "application/xml": "xml" }>;
      201: Response<{ "application/json": Pet }>;
    };

    expectTypeOf<SuccessResponse<Responses, "text/plain">>().toEqualTypeOf<"text" | Pet>();
    expectTypeOf<SuccessResponse<Responses>>().toEqualTypeOf<"text" | "xml" | Pet>();
  });

  it("ErrorResponse of a body that is not JSON is a string, also when Media picks it", () => {
    type Responses = { 400: Response<{ "application/xml": { code: number } }> };

    expectTypeOf<ErrorResponse<Responses>>().toEqualTypeOf<string>();
    expectTypeOf<ErrorResponse<Responses, "application/json">>().toEqualTypeOf<string>();
  });

  it("SuccessResponse picks one JSON media type among several, as an Accept header does", () => {
    type Responses = {
      200: Response<{ "application/json": Pet; "application/ld+json": Problem }>;
    };

    expectTypeOf<SuccessResponse<Responses, "application/ld+json">>().toEqualTypeOf<Problem>();
    expectTypeOf<SuccessResponseJSON<Operation<Responses>>>().toEqualTypeOf<Pet | Problem>();
  });

  it("a client of any /json media type falls back to a problem+json error it does not match", () => {
    type Responses = {
      400: Response<{ "application/problem+json": Problem }>;
      404: Response<{ "application/json": { code: number } }>;
    };

    expectTypeOf<ErrorResponse<Responses, `${string}/json`>>().toEqualTypeOf<
      Problem | { code: number }
    >();
  });

  it("JSONLike takes every JSON media type", () => {
    type Content = {
      "application/vnd.api+json": Pet;
      "application/json; charset=utf-8": Problem;
      "text/plain": string;
    };

    expectTypeOf<JSONLike<Content>>().toEqualTypeOf<Pet | Problem>();
  });

  it("RequestBodyJSON of a merge-patch+json body is its schema", () => {
    type Patch = {
      requestBody: { content: { "application/merge-patch+json": Partial<Pet> } };
    };

    expectTypeOf<RequestBodyJSON<Patch>>().toEqualTypeOf<Partial<Pet>>();
  });
});

describe("a client of JSON media types", () => {
  it("GET of a problem+json error types the error with its schema", async () => {
    const { error } = await jsonClient().GET("/problem");

    expectTypeOf(error).toEqualTypeOf<Problem | undefined>();
  });

  it("GET of an HTML error types the error as a string", async () => {
    const { data, error } = await jsonClient().GET("/html-error");

    expectTypeOf(data).toEqualTypeOf<Pet | undefined>();
    expectTypeOf(error).toEqualTypeOf<string | undefined>();
  });

  it("GET of a text success types no data, and parseAs text a string", async () => {
    const { data } = await jsonClient().GET("/text");
    const { data: text } = await jsonClient().GET("/text", { parseAs: "text" });
    const { data: blob } = await jsonClient().GET("/text", { parseAs: "blob" });

    expectTypeOf(data).toEqualTypeOf<undefined>();
    expectTypeOf(text).toEqualTypeOf<string | undefined>();
    expectTypeOf(blob).toEqualTypeOf<Blob | undefined>();
  });

  it("HEAD of a response without content types no data", async () => {
    type Paths = {
      "/pets": { head: Operation<{ 200: { headers: {}; content?: never } }> };
    };
    const client = createClient<Paths, `${string}/json`>();

    const { data, error } = await client.HEAD("/pets");

    expectTypeOf(data).toEqualTypeOf<undefined>();
    expectTypeOf(error).toEqualTypeOf<undefined>();
  });
});
