import fetchModule = require("openapi-typesafe-fetch");
import createQueryClient = require("openapi-typesafe-react-query");

import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js" with {
  "resolution-mode": "import",
};

/**
 * `require()` of the fetch client returns `{ default, ...named }`, and `require()` of the
 * react-query client returns `createClient` itself (ADR-022). The declarations say the same.
 */

const client = fetchModule.default<paths>({ baseUrl: "https://api.github.com" });

export const $api = createQueryClient(client);

// The CommonJS module sets `default` to `createClient` too, as Rollup's interop reads it.
export const viaDefault = createQueryClient.default(client);

export const pathBasedClient = fetchModule.createPathBasedClient<paths>();

// @ts-expect-error `require()` returns the module object of the fetch client, not the function
export const notCallable = fetchModule<paths>();
