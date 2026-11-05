import createClient from "openapi-typesafe-fetch";
import createQueryClient, { type QueryKey } from "openapi-typesafe-react-query";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js" with {
  "resolution-mode": "import",
};

/**
 * A CommonJS consumer (`.cts`, `NodeNext`) reads the `.d.cts` declarations. A default import is
 * the client in both packages, and the exported types are found next to it.
 */

const client = createClient<paths>({ baseUrl: "https://api.github.com" });

export const $api = createQueryClient(client);

export const repositoryKey: QueryKey<paths, "get", "/repos/{owner}/{repo}"> = [
  "get",
  "/repos/{owner}/{repo}",
  { params: { path: { owner: "octocat", repo: "hello-world" } } },
];
