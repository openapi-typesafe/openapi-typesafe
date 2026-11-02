import { describe, expect, it } from "vitest";
import {
  isHostAllowed,
  isInsideDirectory,
} from "../../../src/adapters/redocly-loader/ref-access.js";
import {
  fetchWithCheckedRedirects,
  MAX_CHECKED_REDIRECTS,
  type RemoteFetch,
} from "../../../src/adapters/redocly-loader/remote-fetch.js";

/** A fetch that answers from a table and records each request. */
function tableFetch(answers: Record<string, () => Response>) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: RemoteFetch = async (input, init) => {
    requests.push({ url: input, init });
    return (answers[input] ?? (() => new Response("missing", { status: 404 })))();
  };
  return { fetchImpl, requests };
}

const redirectTo = (location: string) => () =>
  new Response(null, { status: 302, headers: { location } });

describe("isInsideDirectory", () => {
  it.each([
    ["/work/api", "/work/api", true],
    ["/work/api/a.yaml", "/work/api", true],
    ["/work/api/../secrets/a.yaml", "/work/api", false],
    ["/work/api-other/a.yaml", "/work/api", false],
    ["/work/api/..hidden/a.yaml", "/work/api", true],
  ])("isInsideDirectory(%s, %s) is %s", (target, root, expected) => {
    expect(isInsideDirectory(target, root)).toBe(expected);
  });
});

describe("isHostAllowed", () => {
  it.each([
    ["https://API.example.com/a.yaml", ["api.example.com"], true],
    ["https://api.example.com:8443/a.yaml", ["api.example.com"], true],
    ["https://api.example.com:8443/a.yaml", ["api.example.com:8443"], true],
    ["https://api.example.com/a.yaml", ["api.example.com:8443"], false],
    ["https://evil.example.com/a.yaml", [" API.example.com "], false],
    ["http://169.254.169.254/latest", [], false],
  ])("isHostAllowed(%s, %j) is %s", (url, hosts, expected) => {
    expect(isHostAllowed(new URL(url), hosts)).toBe(expected);
  });
});

describe("fetchWithCheckedRedirects", () => {
  it("fetchWithCheckedRedirects keeps headers on the same origin and drops them on another", async () => {
    const { fetchImpl, requests } = tableFetch({
      "https://a.example/one": redirectTo("/two"),
      "https://a.example/two": redirectTo("https://b.example/three"),
      "https://b.example/three": () => Response.json({}),
    });
    const checked = fetchWithCheckedRedirects(fetchImpl, ["a.example", "b.example"]);

    const response = await checked("https://a.example/one", {
      headers: { Authorization: "secret" },
    });

    expect(response.status).toBe(200);
    expect(
      requests.map((request) => [request.url, request.init?.headers, request.init?.redirect]),
    ).toEqual([
      ["https://a.example/one", { Authorization: "secret" }, "manual"],
      ["https://a.example/two", { Authorization: "secret" }, "manual"],
      ["https://b.example/three", undefined, "manual"],
    ]);
  });

  it("fetchWithCheckedRedirects refuses a redirect to a host that is not listed, before fetching it", async () => {
    const { fetchImpl, requests } = tableFetch({
      "https://a.example/one": redirectTo("http://10.0.0.1/"),
    });
    const checked = fetchWithCheckedRedirects(fetchImpl, ["a.example"]);

    await expect(checked("https://a.example/one")).rejects.toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { ref: "http://10.0.0.1/" },
    });
    expect(requests).toHaveLength(1);
  });

  it("fetchWithCheckedRedirects returns a redirect without a location as it is", async () => {
    const { fetchImpl } = tableFetch({
      "https://a.example/one": () => new Response(null, { status: 302 }),
    });

    const response = await fetchWithCheckedRedirects(fetchImpl, ["a.example"])(
      "https://a.example/one",
    );

    expect(response.status).toBe(302);
  });

  it("fetchWithCheckedRedirects stops after the redirect limit", async () => {
    const { fetchImpl, requests } = tableFetch({ "https://a.example/loop": redirectTo("/loop") });

    const failure = fetchWithCheckedRedirects(fetchImpl, ["a.example"])("https://a.example/loop");

    await expect(failure).rejects.toThrow(`More than ${MAX_CHECKED_REDIRECTS} redirects`);
    expect(requests).toHaveLength(MAX_CHECKED_REDIRECTS + 1);
  });
});
