import type { HttpMethod, MediaType } from "openapi-typesafe-helpers";
import { expectTypeOf, test } from "vitest";
import type { FetchResponse, MaybeOptionalInit } from "../../src/index.js";
import type { paths as GitHub } from "./schemas/github.js";
import type { paths as Stripe } from "./schemas/stripe.js";

/**
 * Pre-beta test plan §6.8: no operation of the GitHub and Stripe schemas infers `any` for `data`,
 * `error` or the request options. One `any` there turns off type checking for every caller.
 */

type IsAny<T> = 0 extends 1 & T ? true : false;

type ResponseOf<Operation> = Operation extends Record<string | number, unknown>
  ? FetchResponse<Operation, {}, MediaType>
  : never;

/** `"<path> <method>"` for every operation whose `data`, `error` or init has `any`. */
type OperationsWithAny<Paths> = {
  [Path in keyof Paths & string]: {
    [Method in HttpMethod & keyof Paths[Path]]: Paths[Path][Method] extends undefined
      ? never
      : true extends
            | IsAny<NonNullable<ResponseOf<Paths[Path][Method]>["data"]>>
            | IsAny<NonNullable<ResponseOf<Paths[Path][Method]>["error"]>>
            | IsAny<MaybeOptionalInit<Paths[Path], Method>>
        ? `${Path} ${Method}`
        : never;
  }[HttpMethod & keyof Paths[Path]];
}[keyof Paths & string];

test("no GitHub operation infers any", () => {
  expectTypeOf<OperationsWithAny<GitHub>>().toEqualTypeOf<never>();
});

test("no Stripe operation infers any", () => {
  expectTypeOf<OperationsWithAny<Stripe>>().toEqualTypeOf<never>();
});

test("the check finds an operation that infers any", () => {
  type WithAny = { "/a": { get: { responses: { 200: { content: { "application/json": any } } } } } };

  expectTypeOf<OperationsWithAny<WithAny>>().toEqualTypeOf<"/a get">();
});
