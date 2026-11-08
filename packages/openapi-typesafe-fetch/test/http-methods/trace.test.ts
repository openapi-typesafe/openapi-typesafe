import { describe, expect, test } from "vitest";
import { createObservedClient } from "../helpers.js";
import type { paths } from "./schemas/trace.js";

describe("TRACE()", () => {
  // The Fetch standard forbids TRACE: Node.js and Deno reject it in new Request(); Bun 1.4 sends
  // it and returns an empty body (ADR-041). The tests run on Node.js.
  test("(not supported in Node.js)", async () => {
    const client = createObservedClient<paths>();
    await expect(() =>
      client.TRACE("/resources/{id}", { params: { path: { id: 123 } } }),
    ).rejects.toThrow();
  });
});
