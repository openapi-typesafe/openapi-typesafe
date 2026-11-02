import axios from "axios";
import { createApiFetchClient } from "feature-fetch";
import { Fetcher } from "openapi-typescript-fetch";
import { afterAll, test, vi } from "vitest";
import createClient, { createPathBasedClient } from "../../dist/index.mjs";

// Every client below sends its requests through the stubbed global `fetch`, so the benchmark
// measures client overhead only and never touches the network.
const BASE_URL = "https://api.test.local";

const fetchMock = vi.fn(
  () =>
    new Promise((resolve) => {
      process.nextTick(() => {
        resolve(Response.json({}, { status: 200 }));
      });
    }),
);
vi.stubGlobal("fetch", fetchMock);

afterAll(() => {
  vi.unstubAllGlobals();
});

test("setup", async ({ bench }) => {
  await bench.compare(
    bench("openapi-typesafe-fetch", async () => {
      createClient({ baseUrl: BASE_URL });
    }),
    bench("openapi-typesafe-fetch (path based)", async () => {
      createPathBasedClient({ baseUrl: BASE_URL });
    }),
    bench("openapi-typescript-fetch", async () => {
      const fetcher = Fetcher.for();
      fetcher.configure({
        baseUrl: BASE_URL,
      });
      fetcher.path("/pet/findByStatus").method("get").create();
    }),
    bench("axios", async () => {
      axios.create({
        baseURL: BASE_URL,
        // Use the stubbed global fetch instead of the Node http adapter, which would hit the network.
        adapter: "fetch",
      });
    }),
    bench("feature-fetch", async () => {
      createApiFetchClient({ prefixUrl: BASE_URL });
    }),
  );
});

test("get (only URL)", async ({ bench }) => {
  const openapiFetch = createClient({ baseUrl: BASE_URL });
  const openapiFetchPath = createPathBasedClient({ baseUrl: BASE_URL });
  const openapiTSFetch = Fetcher.for();
  openapiTSFetch.configure({
    baseUrl: BASE_URL,
  });
  const openapiTSFetchGET = openapiTSFetch.path("/url").method("get").create();
  const axiosInstance = axios.create({
    baseURL: BASE_URL,
    // Use the stubbed global fetch instead of the Node http adapter, which would hit the network.
    adapter: "fetch",
  });
  const featureFetch = createApiFetchClient({ prefixUrl: BASE_URL });

  await bench.compare(
    bench("openapi-typesafe-fetch", async () => {
      await openapiFetch.GET("/url");
    }),
    bench("openapi-typesafe-fetch (path based)", async () => {
      await openapiFetchPath["/url"].GET();
    }),
    bench("openapi-typescript-fetch", async () => {
      await openapiTSFetchGET();
    }),
    bench("axios", async () => {
      await axiosInstance.get("/url");
    }),
    bench("feature-fetch", async () => {
      await featureFetch.get("/url");
    }),
  );
});

test("get (headers)", async ({ bench }) => {
  const openapiFetch = createClient({
    baseUrl: BASE_URL,
    headers: { "x-base-header": 123 },
  });
  const openapiFetchPath = createPathBasedClient({
    baseUrl: BASE_URL,
    headers: { "x-base-header": 123 },
  });
  const openapiTSFetch = Fetcher.for();
  openapiTSFetch.configure({
    baseUrl: BASE_URL,
    init: { headers: { "x-base-header": 123 } },
  });
  const openapiTSFetchGET = openapiTSFetch.path("/url").method("get").create();
  const axiosInstance = axios.create({
    baseURL: BASE_URL,
    // Use the stubbed global fetch instead of the Node http adapter, which would hit the network.
    adapter: "fetch",
  });
  const featureFetch = createApiFetchClient({
    prefixUrl: BASE_URL,
    headers: { "x-base-header": "123" },
  });

  await bench.compare(
    bench("openapi-typesafe-fetch", async () => {
      await openapiFetch.GET("/url", {
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }),
    bench("openapi-typesafe-fetch (path based)", async () => {
      await openapiFetchPath["/url"].GET({
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }),
    bench("openapi-typescript-fetch", async () => {
      await openapiTSFetchGET(null, {
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }),
    bench("axios", async () => {
      await axiosInstance.get("/url", {
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }),
    bench("feature-fetch", async () => {
      await featureFetch.get("/url", {
        headers: { "x-header-1": "123", "x-header-2": "456" },
      });
    }),
  );
});
