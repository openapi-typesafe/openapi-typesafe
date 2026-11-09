import type * as Fetch from "openapi-typesafe-fetch/helpers";
import { describe, expect, it } from "vitest";
import type * as Helpers from "../src/index.js";

// In generic code TypeScript compares two copies of a mapped or conditional type by declaration,
// not by shape, so these functions compile only while both packages name one declaration. The
// type check of this file (`lint:ts`) is the test; the calls below only run it.
const readable = <T>(value: Helpers.Readable<T>): Fetch.Readable<T> => value;
const writable = <T>(value: Fetch.Writable<T>): Helpers.Writable<T> => value;
const requestBody = <Operation>(
  value: Helpers.Writable<Helpers.OperationRequestBodyContent<Operation>>,
): Fetch.Writable<Fetch.OperationRequestBodyContent<Operation>> => value;
const responseBody = <Responses extends Record<string | number, unknown>>(
  value: Fetch.Readable<Fetch.SuccessResponse<Responses>>,
): Helpers.Readable<Helpers.SuccessResponse<Responses>> => value;
const paths = <Paths extends {}, Method extends Helpers.HttpMethod>(
  value: Fetch.PathsWithMethod<Paths, Method>,
): Helpers.PathsWithMethod<Paths, Method> => value;

describe("helper types in generic code", () => {
  it("a value typed with the names of one package fits the names of the other", () => {
    const value = { id: "1" } as never;

    const passed = [
      readable(value),
      writable(value),
      requestBody(value),
      responseBody(value),
      paths(value),
    ];

    expect(passed).toEqual([value, value, value, value, value]);
  });
});
