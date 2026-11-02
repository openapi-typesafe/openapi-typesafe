import createClient from "openapi-typesafe-fetch";
import createQueryClient from "openapi-typesafe-react-query";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js";

/** Typed hooks a consumer writes with the react-query client; checked, never run. */

const $api = createQueryClient(createClient<paths>({ baseUrl: "https://api.github.com" }));

export function useRepositoryName(owner: string, repo: string): string | undefined {
  const { data } = $api.useQuery("get", "/repos/{owner}/{repo}", {
    params: { path: { owner, repo } },
  });
  return data?.full_name;
}

export const repositoryOptions = $api.queryOptions("get", "/repos/{owner}/{repo}", {
  params: { path: { owner: "octocat", repo: "hello-world" } },
});
