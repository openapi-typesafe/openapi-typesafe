import { describe, expect, it } from "vitest";
import { isHostAllowed } from "../../../src/adapters/redocly-loader/allowed-hosts.js";
import {
  type ConfiguredHeader,
  headersFor,
} from "../../../src/adapters/redocly-loader/configured-headers.js";
import { isInsideDirectory } from "../../../src/adapters/redocly-loader/ref-access.js";
import {
  fetchWithCheckedRedirects,
  MAX_REDIRECTS,
  RedirectedUrls,
  type RedirectPolicy,
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

const apiKey = (matches: string): ConfiguredHeader => ({ matches, name: "X-Api-Key", value: "k" });

/** Only `a.example` gets the header; both hosts are allowed. */
const POLICY: RedirectPolicy = {
  headers: [apiKey("a.example/**")],
  hosts: ["a.example", "b.example"],
  rootUrl: undefined,
  redirects: new RedirectedUrls(),
};

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
    // A listed default port matches a URL that leaves it out, and the other way round.
    ["https://api.example.com/a.yaml", ["api.example.com:443"], true],
    ["https://api.example.com:443/a.yaml", ["api.example.com:443"], true],
    ["http://api.example.com/a.yaml", ["api.example.com:443"], false],
    // IPv6 addresses, written with or without brackets.
    ["http://[::1]:8080/a.yaml", ["::1"], true],
    ["http://[::1]:8080/a.yaml", ["[::1]"], true],
    ["http://[::1]:8080/a.yaml", ["[0:0::1]:8080"], true],
    ["http://[::1]:8080/a.yaml", ["[::1]:9090"], false],
    ["http://[::2]/a.yaml", ["::1"], false],
    // The fully qualified form with a trailing dot names the same host.
    ["https://api.example.com./a.yaml", ["api.example.com"], true],
    ["https://api.example.com/a.yaml", ["api.example.com."], true],
    ["https://api.example.com.evil.example/a.yaml", ["api.example.com."], false],
    // Hosts are compared as the URL parser writes them: Punycode, dotted IPv4.
    ["https://bücher.example/a.yaml", ["BÜCHER.example"], true],
    ["http://2130706433/a.yaml", ["127.0.0.1"], true],
    ["http://127.0.0.1/a.yaml", ["0x7f.1"], true],
    // An entry that is not a host never matches, even a URL without a host.
    ["file:///etc/hosts", [""], false],
    ["https://api.example.com/a.yaml", ["api.example.com/path"], false],
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
    const checked = fetchWithCheckedRedirects(fetchImpl, POLICY);

    const response = await checked("https://a.example/one", { headers: {} });

    expect(response.status).toBe(200);
    expect(
      requests.map((request) => [request.url, request.init?.headers, request.init?.redirect]),
    ).toEqual([
      ["https://a.example/one", { "X-Api-Key": "k" }, "manual"],
      ["https://a.example/two", { "X-Api-Key": "k" }, "manual"],
      ["https://b.example/three", {}, "manual"],
    ]);
  });

  it("fetchWithCheckedRedirects drops the headers on a redirect to HTTP on the same host", async () => {
    const { fetchImpl, requests } = tableFetch({
      "https://a.example/one": redirectTo("http://a.example/one"),
      "http://a.example/one": () => Response.json({}),
    });

    await fetchWithCheckedRedirects(fetchImpl, POLICY)("https://a.example/one");

    expect(requests.map((request) => request.init?.headers)).toEqual([{ "X-Api-Key": "k" }, {}]);
  });

  it("fetchWithCheckedRedirects follows a redirect to any host without a host list", async () => {
    const { fetchImpl, requests } = tableFetch({
      "https://a.example/one": redirectTo("http://10.0.0.1/"),
      "http://10.0.0.1/": () => Response.json({}),
    });

    const response = await fetchWithCheckedRedirects(fetchImpl, { ...POLICY, hosts: undefined })(
      "https://a.example/one",
    );

    expect(response.status).toBe(200);
    expect(requests.map((request) => request.init?.headers)).toEqual([{ "X-Api-Key": "k" }, {}]);
  });

  it("fetchWithCheckedRedirects refuses a redirect to a host that is not listed, before fetching it", async () => {
    const { fetchImpl, requests } = tableFetch({
      "https://a.example/one": redirectTo("http://10.0.0.1/"),
    });
    const checked = fetchWithCheckedRedirects(fetchImpl, POLICY);

    await expect(checked("https://a.example/one")).rejects.toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { ref: "http://10.0.0.1/" },
    });
    expect(requests).toHaveLength(1);
  });

  it("fetchWithCheckedRedirects follows the root document's redirects to any host", async () => {
    const { fetchImpl, requests } = tableFetch({
      "https://a.example/root": redirectTo("https://cdn.example/root"),
      "https://cdn.example/root": () => Response.json({}),
    });
    const policy = { ...POLICY, rootUrl: "https://a.example/root" };

    const response = await fetchWithCheckedRedirects(fetchImpl, policy)("https://a.example/root");

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("fetchWithCheckedRedirects records the URL a redirected document came from", async () => {
    const { fetchImpl } = tableFetch({
      "https://a.example/latest": redirectTo("/static/v1/root.yaml"),
      "https://a.example/static/v1/root.yaml": () => Response.json({}),
      "https://a.example/plain.yaml": () => Response.json({}),
    });
    const redirects = new RedirectedUrls();
    const checked = fetchWithCheckedRedirects(fetchImpl, { ...POLICY, redirects });

    await checked("https://a.example/latest");
    await checked("https://a.example/plain.yaml");

    expect(redirects.finalUrlOf("https://a.example/latest")).toBe(
      "https://a.example/static/v1/root.yaml",
    );
    expect(redirects.finalUrlOf("https://a.example/plain.yaml")).toBe(
      "https://a.example/plain.yaml",
    );
  });

  it("fetchWithCheckedRedirects returns a redirect without a location as it is", async () => {
    const { fetchImpl } = tableFetch({
      "https://a.example/one": () => new Response(null, { status: 302 }),
    });

    const response = await fetchWithCheckedRedirects(fetchImpl, POLICY)("https://a.example/one");

    expect(response.status).toBe(302);
  });

  it("fetchWithCheckedRedirects stops after the redirect limit", async () => {
    const { fetchImpl, requests } = tableFetch({ "https://a.example/loop": redirectTo("/loop") });

    const failure = fetchWithCheckedRedirects(fetchImpl, POLICY)("https://a.example/loop");

    await expect(failure).rejects.toThrow(`More than ${MAX_REDIRECTS} redirects`);
    expect(requests).toHaveLength(MAX_REDIRECTS + 1);
  });
});

describe("headersFor", () => {
  it.each([
    ["https://a.example/x.yaml", "a.example/**", true],
    ["https://a.example:8443/x.yaml", "a.example:8443/**", true],
    ["https://sub.a.example/x.yaml", "*.a.example/**", true],
    ["https://b.example/x.yaml", "a.example/**", false],
    // A pattern without a protocol, or with `https://`, never applies over plain HTTP.
    ["http://a.example/x.yaml", "a.example/**", false],
    ["http://a.example/x.yaml", "https://a.example/**", false],
    ["http://a.example/x.yaml", "http://a.example/**", true],
    ["https://a.example/x.yaml", "http://a.example/**", false],
    // Plain HTTP to this machine needs no `http://` in the pattern: it does not cross the network.
    ["http://localhost:8080/x.yaml", "localhost:8080/**", true],
    ["http://127.0.0.1:8080/x.yaml", "127.0.0.1:8080/**", true],
    // A glob reads `[::1]` as a character class, so this pattern names the host with `*`.
    ["http://[::1]:8080/x.yaml", "*/x.yaml", true],
    ["http://localhost.evil.example/x.yaml", "localhost*/**", false],
    // A `*` cannot reach past the host and path: query, fragment and user info are not matched.
    ["https://evil.example?.a.example/x.yaml", "*.a.example/**", false],
    ["https://evil.example#.a.example/x.yaml", "*.a.example/**", false],
    ["https://x.a.example@evil.example/x.yaml", "*.a.example/**", false],
    ["https://a.example/x.yaml?token=1", "a.example/x.yaml", true],
  ])("headersFor(%s) with the pattern %s sends the header: %s", async (url, matches, expected) => {
    const headers = await headersFor(new URL(url), [apiKey(matches)]);

    expect(headers).toEqual(expected ? { "X-Api-Key": "k" } : {});
  });

  it("headersFor reads the value of an environment variable, as Redocly does", async () => {
    process.env.OPENAPI_TYPESAFE_TEST_KEY = "from-env";
    const header: ConfiguredHeader = {
      matches: "a.example/**",
      name: "X-Api-Key",
      envVariable: "OPENAPI_TYPESAFE_TEST_KEY",
    };

    const headers = await headersFor(new URL("https://a.example/x.yaml"), [header]);
    delete process.env.OPENAPI_TYPESAFE_TEST_KEY;

    expect(headers).toEqual({ "X-Api-Key": "from-env" });
  });
});
