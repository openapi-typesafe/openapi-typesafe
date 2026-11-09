import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, {
  isResponseError,
  type QueryError,
  type ResponseError,
} from "../src/index.js";

/**
 * A non-OK response with an empty body gives `error: undefined` in the fetch client; it is still a
 * failure (upstream #2070, #2829, ADR-013). The hooks throw a `ResponseError` for it, so `error` is
 * never `undefined` and the hook types say so. A JSON `null` body counts as no body; a falsy error
 * body (`0`) is the error itself. Network and parse errors reach `error` too, so its type has
 * TanStack's `DefaultError` (`Error`) and `isResponseError` tells a `ResponseError` apart.
 */

type Operation = {
  responses: {
    200: { content: { "application/json": { items: number[] } } };
    500: { content: { "application/json": number } };
  };
};
type Paths = { "/items": { get: Operation; post: Operation } };

const BASE_URL = "https://api.example.com";
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

function clientAnswering(response: () => Response) {
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async () => response(),
  });
  return createClient(fetchClient);
}

function emptyError(): Response {
  return new Response(null, { status: SERVER_ERROR, headers: { "Content-Length": "0" } });
}

/** An empty error the operation does not declare (only 500 is), with a status text. */
function undeclaredEmptyError(): Response {
  return new Response(null, { status: SERVICE_UNAVAILABLE, statusText: "Service Unavailable" });
}

/** Check the error a hook threw for an empty error response. */
function expectResponseError(error: unknown, status: number): void {
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ name: "ResponseError", status });
  expect((error as ResponseError).response.status).toBe(status);
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("non-OK responses without an error body", () => {
  it("queryFn of an empty error response rejects", async () => {
    const client = clientAnswering(emptyError);

    const error = await createQueryClient()
      .fetchQuery(client.queryOptions("get", "/items"))
      .catch((reason: unknown) => reason);

    expectResponseError(error, SERVER_ERROR);
    expect((error as ResponseError).message).toBe(
      "Request failed with status 500 and no error body",
    );
  });

  it("the message of an undeclared empty error names the status and its text", async () => {
    const client = clientAnswering(undeclaredEmptyError);

    const error = await createQueryClient()
      .fetchQuery(client.queryOptions("get", "/items"))
      .catch((reason: unknown) => reason);

    expectResponseError(error, SERVICE_UNAVAILABLE);
    expect((error as ResponseError).message).toBe(
      "Request failed with status 503 Service Unavailable and no error body",
    );
  });

  it("useQuery of an empty error response has a ResponseError, not undefined", async () => {
    const client = clientAnswering(emptyError);

    const { result } = renderHook(() => client.useQuery("get", "/items"), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expectResponseError(result.current.error, SERVER_ERROR);
    expectTypeOf(result.current.error).toEqualTypeOf<number | ResponseError | Error | null>();
  });

  it("queryFn of a JSON null error body rejects with a ResponseError", async () => {
    const client = clientAnswering(() => Response.json(null, { status: SERVER_ERROR }));

    const error = await createQueryClient()
      .fetchQuery(client.queryOptions("get", "/items"))
      .catch((reason: unknown) => reason);

    expectResponseError(error, SERVER_ERROR);
  });

  it("useQuery of a JSON null error body has a ResponseError, not null", async () => {
    const client = clientAnswering(() => Response.json(null, { status: SERVER_ERROR }));

    const { result } = renderHook(() => client.useQuery("get", "/items"), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expectResponseError(result.current.error, SERVER_ERROR);
  });

  it("queryFn of a falsy error body rejects with that body", async () => {
    const client = clientAnswering(() => Response.json(0, { status: SERVER_ERROR }));

    const query = createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    await expect(query).rejects.toBe(0);
  });

  it("isResponseError narrows the hook error to a ResponseError", () => {
    type HookError = ReturnType<ReturnType<typeof clientAnswering>["useQuery"]>["error"];
    const error = null as HookError;

    if (isResponseError(error)) {
      expectTypeOf(error).toEqualTypeOf<ResponseError>();
    } else {
      expectTypeOf(error).toEqualTypeOf<number | Error | null>();
    }
    expect(error).toBeNull();
  });

  it("error instanceof Error does not claim a status: it matches network errors too", () => {
    const error = null as QueryError<{ code: number; message: string }> | null;

    if (error instanceof Error) {
      // @ts-expect-error a network or parse error has no status
      expect(error.status).toBeUndefined();
    } else if (error) {
      expectTypeOf(error).toEqualTypeOf<{ code: number; message: string }>();
    }
    expect(error).toBeNull();
  });

  it("QueryError leaves out undefined and null", () => {
    expectTypeOf<QueryError<{ code: number } | null | undefined>>().toEqualTypeOf<
      { code: number } | ResponseError | Error
    >();
  });

  it("useQuery of a network error has that error, which is no ResponseError", async () => {
    const networkError = new TypeError("fetch failed");
    const client = createClient(
      createFetchClient<Paths>({
        baseUrl: BASE_URL,
        fetch: async () => {
          throw networkError;
        },
      }),
    );

    const { result } = renderHook(() => client.useQuery("get", "/items"), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(networkError);
    expect(isResponseError(result.current.error)).toBe(false);
  });

  it("isResponseError is true for a ResponseError only", async () => {
    const client = clientAnswering(emptyError);
    const responseError = await createQueryClient()
      .fetchQuery(client.queryOptions("get", "/items"))
      .catch((reason: unknown) => reason);

    expect(isResponseError(responseError)).toBe(true);
    expect(isResponseError(new TypeError("fetch failed"))).toBe(false);
    expect(isResponseError(new SyntaxError("Unexpected token"))).toBe(false);
    expect(isResponseError({ name: "ResponseError", status: SERVER_ERROR })).toBe(false);
    expect(isResponseError(0)).toBe(false);
    expect(isResponseError(null)).toBe(false);
  });

  it("isResponseError is true for a ResponseError of another copy of the package", () => {
    const copy = Object.assign(new Error("Request failed"), { name: "ResponseError" });

    expect(isResponseError(copy)).toBe(true);
  });

  it("mutationFn of an empty error response rejects", async () => {
    const client = clientAnswering(emptyError);
    const { result } = renderHook(() => client.useMutation("post", "/items"), {
      wrapper: wrapperFor(createQueryClient()),
    });

    const error = await result.current.mutateAsync({}).catch((reason: unknown) => reason);

    expectResponseError(error, SERVER_ERROR);
    expectTypeOf(result.current.error).toEqualTypeOf<number | ResponseError | Error | null>();
  });

  it("useInfiniteQuery of an empty error response ends in the error state", async () => {
    const client = clientAnswering(emptyError);
    const options = { getNextPageParam: () => undefined, initialPageParam: 0 };

    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", {}, options), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expectResponseError(result.current.error, SERVER_ERROR);
  });
});
