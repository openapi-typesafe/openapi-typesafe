import { describe, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  MediaType,
  SuccessResponse,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import type { FetchResponse } from "../../src/index.js";

/**
 * A hand-written response map with only an index signature over statuses says that any status
 * may answer with its value, so the value types both `data` and `error`, as a declared status does.
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

// biome-ignore lint/suspicious/noExplicitAny: the hand-written map under test
type AnyStatusValue = any;
type AnyStatusOperation = { responses: Record<string, AnyStatusValue> };
type StringStatusOperation = { responses: Record<string, Json<Item>> };
type NumberStatusOperation = { responses: { [status: number]: Json<Item> } };
type ClassStatusOperation = {
  responses: { [status: `2${string}`]: Json<Item>; [status: `4${string}`]: Json<Problem> };
};
type DeclaredOperation = { responses: { 200: Json<Item>; 404: Json<Problem> } };

describe("response maps with an index signature over statuses", () => {
  it("FetchResponse of a Record<string, any> map types data and error any", () => {
    expectTypeOf<Data<AnyStatusOperation>>().toBeAny();
    expectTypeOf<Failure<AnyStatusOperation>>().toBeAny();
  });

  it("FetchResponse of a string index signature types data and error by its value", () => {
    expectTypeOf<Data<StringStatusOperation>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<StringStatusOperation>>().toEqualTypeOf<Item | undefined>();
  });

  it("FetchResponse of a number index signature types data and error by its value", () => {
    expectTypeOf<Data<NumberStatusOperation>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<NumberStatusOperation>>().toEqualTypeOf<Item | undefined>();
  });

  it("FetchResponse of status class signatures types data and error by their class", () => {
    expectTypeOf<Data<ClassStatusOperation>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<ClassStatusOperation>>().toEqualTypeOf<Problem | undefined>();
  });

  it("SuccessResponse and ErrorResponse of a number index signature give its body", () => {
    expectTypeOf<SuccessResponse<NumberStatusOperation["responses"]>>().toEqualTypeOf<Item>();
    expectTypeOf<ErrorResponse<NumberStatusOperation["responses"]>>().toEqualTypeOf<Item>();
  });

  it("the JSON helpers of a string index signature give its body", () => {
    expectTypeOf<SuccessResponseJSON<StringStatusOperation>>().toEqualTypeOf<Item>();
    expectTypeOf<ErrorResponseJSON<StringStatusOperation>>().toEqualTypeOf<Item>();
  });

  it("FetchResponse of an any index signature through a constraint fits no unrelated type", () => {
    function bodies<Operation extends AnyStatusOperation>(
      response: FetchResponse<Operation, {}, MediaType>,
    ) {
      // @ts-expect-error the data of an unknown operation is no number
      const dataNumber: number = response.data ?? 0;
      // @ts-expect-error the error of an unknown operation is no number
      const errorNumber: number = response.error ?? 0;
      return [dataNumber, errorNumber];
    }

    expectTypeOf(bodies<DeclaredOperation>).returns.toEqualTypeOf<number[]>();
  });

  it("FetchResponse of any content behind a constraint fits no other type", () => {
    function bodies<Operation extends { responses: Record<string, { content: AnyStatusValue }> }>(
      response: FetchResponse<Operation, {}, MediaType>,
    ) {
      // @ts-expect-error the data of an unknown operation is no number
      const dataNumber: number = response.data ?? 0;
      // @ts-expect-error the error of an unknown operation is no number
      const errorNumber: number = response.error ?? 0;
      return [dataNumber, errorNumber];
    }

    expectTypeOf(bodies<DeclaredOperation>).returns.toEqualTypeOf<number[]>();
  });

  it("FetchResponse of a union with a Record<string, any> map types data and error any", () => {
    expectTypeOf<Data<DeclaredOperation | AnyStatusOperation>>().toBeAny();
    expectTypeOf<Failure<DeclaredOperation | AnyStatusOperation>>().toBeAny();
  });

  it("the JSON helpers of an any signature through a constraint fit no other type", () => {
    function bodies<Operation extends { responses: { [status: number]: AnyStatusValue } }>(
      success: SuccessResponseJSON<Operation>,
      error: ErrorResponseJSON<Operation>,
    ) {
      // @ts-expect-error the JSON success body of an unknown operation is no number
      const successNumber: number = success;
      // @ts-expect-error the JSON error body of an unknown operation is no number
      const errorNumber: number = error;
      return [successNumber, errorNumber];
    }

    expectTypeOf(bodies<DeclaredOperation>).parameters.toEqualTypeOf<[Item, Problem]>();
  });

  it("FetchResponse of declared statuses keeps one body per class", () => {
    expectTypeOf<Data<DeclaredOperation>>().toEqualTypeOf<Item | undefined>();
    expectTypeOf<Failure<DeclaredOperation>>().toEqualTypeOf<Problem | undefined>();
  });

  it("FetchResponse of a declared any status keeps the bodies of the other class", () => {
    type Operation = { responses: { 200: Json<Item>; 404: AnyStatusValue } };

    expectTypeOf<Data<Operation>>().toEqualTypeOf<Item | undefined>();
  });

  it("SuccessResponse and ErrorResponse of a Record<string, any> map give any", () => {
    expectTypeOf<SuccessResponse<AnyStatusOperation["responses"]>>().toBeAny();
    expectTypeOf<ErrorResponse<AnyStatusOperation["responses"]>>().toBeAny();
  });

  it("the JSON helpers of a Record<string, any> map give any", () => {
    expectTypeOf<SuccessResponseJSON<AnyStatusOperation>>().toBeAny();
    expectTypeOf<ErrorResponseJSON<AnyStatusOperation>>().toBeAny();
  });
});
