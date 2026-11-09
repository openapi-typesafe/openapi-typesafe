import { describe, expect, it } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

const BASE_URL = "https://api.example.com";

describe("queryKeyInit", () => {
  it("queryKeyInit writes Headers and header pairs as the names and values they send", () => {
    const headers = new Headers({ "X-Tenant": "a" });
    headers.append("Accept", "a/b");
    headers.append("accept", "c/d");

    expect(queryKeyInit({ headers }, "")).toEqual({
      headers: { accept: "a/b, c/d", "x-tenant": "a" },
    });
    expect(
      queryKeyInit(
        {
          headers: [
            ["X-A", "1"],
            ["x-a", "2"],
          ],
        },
        "",
      ),
    ).toEqual({
      headers: { "x-a": "1, 2" },
    });
  });

  it("queryKeyInit keeps a plain headers object, whose null and array values mean more", () => {
    const headers = { "X-A": ["1", "2"], "X-B": null };

    expect(queryKeyInit({ headers }, "")).toEqual({ headers });
  });

  it("queryKeyInit adds the client's base URL unless the init has its own", () => {
    expect(queryKeyInit(undefined, BASE_URL)).toEqual({ baseUrl: BASE_URL });
    expect(queryKeyInit({ baseUrl: "https://other.example" }, BASE_URL)).toEqual({
      baseUrl: "https://other.example",
    });
  });

  it("queryKeyInit leaves out the signal and gives no init without an init and a base URL", () => {
    expect(queryKeyInit({ signal: new AbortController().signal, params: {} }, "")).toEqual({
      params: {},
    });
    expect(queryKeyInit(undefined, "")).toBeUndefined();
    expect(queryKeyInit({}, "")).toEqual({});
  });
});
