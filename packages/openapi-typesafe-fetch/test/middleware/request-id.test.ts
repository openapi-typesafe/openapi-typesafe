import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { randomID } from "../../src/index.js";
import { createObservedClient } from "../helpers.js";
import type { paths } from "./schemas/middleware.js";

/**
 * Middleware request ids came from `Math.random()`. Next.js prerendering rejects that as a
 * non-deterministic side effect before uncached data (upstream #2486, #2763).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("middleware request id", () => {
  it("request with middleware does not call Math.random", async () => {
    const random = vi.spyOn(Math, "random");
    const client = createObservedClient<paths>();
    client.use({ onRequest() {} });

    await client.GET("/posts/{id}", { params: { path: { id: 1 } } });

    expect(random).not.toHaveBeenCalled();
  });

  it("requests from two clients that share a middleware get different ids", async () => {
    const ids: string[] = [];
    const middleware = {
      onRequest({ id }: { id: string }) {
        ids.push(id);
      },
    };
    const first = createObservedClient<paths>();
    const second = createObservedClient<paths>();
    first.use(middleware);
    second.use(middleware);

    await first.GET("/posts/{id}", { params: { path: { id: 1 } } });
    await second.GET("/posts/{id}", { params: { path: { id: 1 } } });

    expect(new Set(ids).size).toBe(2);
  });

  it("randomID is declared and returns a new string id on each call", () => {
    const first = randomID();
    const second = randomID();

    expectTypeOf(randomID).returns.toEqualTypeOf<string>();
    expect(second).not.toBe(first);
  });
});
