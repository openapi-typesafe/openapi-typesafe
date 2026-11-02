import createClient, { createPathBasedClient, type Middleware } from "openapi-typesafe-fetch";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js";

/** Typed calls a consumer writes with the fetch client; checked, never run. */

const client = createClient<paths>({ baseUrl: "https://api.github.com" });

const logger: Middleware = {
  onRequest({ request }) {
    return request;
  },
};
client.use(logger);

export async function readRepository(owner: string, repo: string): Promise<string | undefined> {
  const { data, error, response } = await client.GET("/repos/{owner}/{repo}", {
    params: { path: { owner, repo } },
  });
  if (error !== undefined || !response.ok) {
    return undefined;
  }
  return data.full_name;
}

export async function readRepositoryByPath(owner: string, repo: string): Promise<number> {
  const pathClient = createPathBasedClient<paths>({ baseUrl: "https://api.github.com" });
  const { data } = await pathClient["/repos/{owner}/{repo}"].GET({
    params: { path: { owner, repo } },
  });
  return data?.id ?? 0;
}
