import createClient, { type FetchOptions } from "openapi-typesafe-fetch";
import type { FilterKeys, PathsWithMethod } from "openapi-typesafe-helpers";
import createQueryClient from "openapi-typesafe-react-query";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js";

/**
 * Wrappers generic in the path that type the init as `FetchOptions` of the operation, as users of
 * openapi-fetch write them; checked, never run. Every supported TypeScript must take that init in
 * the client's and the hooks' calls.
 */

type GetPath = PathsWithMethod<paths, "get">;
type GetInit<Path extends GetPath> = FetchOptions<FilterKeys<paths[Path], "get">>;

const client = createClient<paths>({ baseUrl: "https://api.github.com" });
const $api = createQueryClient(client);

export function get<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return client.GET(path, init);
}

export function getIndexed<Path extends GetPath>(
  path: Path,
  init: FetchOptions<paths[Path]["get"]>,
) {
  return client.GET(path, init);
}

export function post<Path extends PathsWithMethod<paths, "post">>(
  path: Path,
  init: FetchOptions<FilterKeys<paths[Path], "post">>,
) {
  return client.POST(path, init);
}

export function useGet<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return $api.useQuery("get", path, init);
}

export function useSuspenseGet<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return $api.useSuspenseQuery("get", path, init);
}

export function getOptions<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return $api.queryOptions("get", path, init);
}

export async function readRepositoryName(owner: string, repo: string): Promise<string> {
  const { data } = await get("/repos/{owner}/{repo}", { params: { path: { owner, repo } } });
  return data?.full_name ?? "";
}

export function readWithoutParameters() {
  // @ts-expect-error the path parameters of "/repos/{owner}/{repo}" are required
  return get("/repos/{owner}/{repo}", {});
}
