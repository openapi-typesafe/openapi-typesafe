import { describe, expectTypeOf, it } from "vitest";
import type { MediaType } from "../../src/helpers.js";
import type { FetchResponse } from "../../src/index.js";

/**
 * A status that a response map marks optional (`200?: X`, `Partial<Record<…>>`) or types as
 * `X | undefined` is still a declared status: `data` and `error` are typed by its body, as for a
 * required status, and not `unknown`.
 */

type Json<Body> = { headers: {}; content: { "application/json": Body } };
type Item = { id: string };
type Problem = { code: number };

type Data<Operation extends Record<string, unknown>> = FetchResponse<
  Operation,
  {},
  MediaType
>["data"];
type Failure<Operation extends Record<string, unknown>> = FetchResponse<
  Operation,
  {},
  MediaType
>["error"];

type OptionalSuccess = { responses: { 200?: Json<Item>; 404: Json<Problem> } };
type OptionalError = { responses: { 200: Json<Item>; 404?: Json<Problem> } };
type UndefinedSuccess = { responses: { 200: Json<Item> | undefined } };
type UndefinedError = { responses: { 200: Json<Item>; 500: Json<Problem> | undefined } };
type PartialRecord = { responses: Partial<Record<200 | 404, Json<Item>>> };
type OptionalDefault = { responses: { default?: Json<Problem> } };
type OptionalEmpty = { responses: { 204?: { headers: {}; content?: never } } };

describe("FetchResponse with optional statuses", () => {
  it("FetchResponse with an optional 200 types data by its body", () => {
    expectTypeOf<Data<OptionalSuccess>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<OptionalSuccess>>().toEqualTypeOf<Problem | undefined>();
  });

  it("FetchResponse with an optional 404 types error by its body", () => {
    expectTypeOf<Data<OptionalError>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<OptionalError>>().toEqualTypeOf<Problem | undefined>();
  });

  it("FetchResponse with a 200 of X or undefined types data by X", () => {
    expectTypeOf<Data<UndefinedSuccess>>().toEqualTypeOf<Item | undefined>();
  });

  it("FetchResponse with a 500 of X or undefined types error by X", () => {
    expectTypeOf<Failure<UndefinedError>>().toEqualTypeOf<Problem | undefined>();
  });

  it("FetchResponse with a Partial Record of statuses types data and error by its body", () => {
    expectTypeOf<Data<PartialRecord>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<PartialRecord>>().toEqualTypeOf<Item | undefined>();
  });

  it("FetchResponse with an optional default only types data and error by it", () => {
    expectTypeOf<Data<OptionalDefault>>().toEqualTypeOf<Problem | undefined>();
    expectTypeOf<Failure<OptionalDefault>>().toEqualTypeOf<Problem | undefined>();
  });

  it("FetchResponse with an optional 204 without content types data as undefined", () => {
    expectTypeOf<Data<OptionalEmpty>>().toEqualTypeOf<undefined>();
  });
});
