import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import createClient, { createQuerySerializer } from "../../src/index.js";

/**
 * `QuerySerializerOptions` asked for both `style` and `explode`, though each has a default, and
 * `onError` took only an `Error` of this realm: one from `node:vm` or an iframe failed
 * `instanceof Error` and was rejected as not an error.
 */

describe("query serializer options with one of style and explode", () => {
  it("an array style alone takes the explode of that style", () => {
    const serialize = createQuerySerializer({ array: { style: "pipeDelimited" } });

    expect(serialize({ ids: [1, 2] })).toBe("ids=1|2");
  });

  it("an array explode alone keeps the form style", () => {
    const serialize = createQuerySerializer({ array: { explode: false } });

    expect(serialize({ ids: [1, 2] })).toBe("ids=1,2");
  });

  it("an object explode alone keeps the deepObject style", () => {
    const serialize = createQuerySerializer({ object: { explode: true } });

    expect(serialize({ filter: { role: "admin" } })).toBe("filter[role]=admin");
  });

  it("an object style alone keeps explode true", () => {
    const serialize = createQuerySerializer({ object: { style: "form" } });

    expect(serialize({ filter: { role: "admin" } })).toBe("role=admin");
  });

  it("an undefined style takes the default", () => {
    const serialize = createQuerySerializer({ object: { style: undefined, explode: undefined } });

    expect(serialize({ filter: { role: "admin" } })).toBe("filter[role]=admin");
  });
});

describe("onError returning an Error of another realm", () => {
  it("the request rejects with that error", async () => {
    const foreignError = runInNewContext('new Error("replaced")') as Error;
    const client = createClient<Record<string, never>>({
      baseUrl: "https://api.example.com",
      fetch: async () => {
        throw new TypeError("network down");
      },
    });
    client.use({ onError: () => foreignError });

    const request = client.request("get", "/items" as never);

    await expect(request).rejects.toBe(foreignError);
  });
});
