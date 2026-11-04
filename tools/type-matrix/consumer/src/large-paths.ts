import createClient from "openapi-typesafe-fetch";
import createQueryClient from "openapi-typesafe-react-query";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js";

/**
 * A schema with hundreds of paths (upstream #1882); checked, never run. When the path is not known,
 * TypeScript checks the call against every path of the method. The init of all those operations
 * was one deep type: TypeScript 5.4 to 6.0 stopped with TS2589 instead of the path error and
 * offered no path completion. The init is now computed per operation.
 */

const client = createClient<paths>({ baseUrl: "https://api.github.com" });
const $api = createQueryClient(client);

/** The arguments of any GET call: the type a call with an unknown path is checked against. */
export type AnyGetArguments = Parameters<typeof client.GET>;

export function readFirstPath(...args: AnyGetArguments): string {
  return args[0];
}

export function readUnknownPath() {
  // @ts-expect-error not a GET path: TS2345 on the path, not TS2589.
  return client.GET("/repos/{owner}/{repo}/not-a-path");
}

export function useUnknownPath() {
  // @ts-expect-error not a GET path: TS2345 on the path, not TS2589.
  return $api.useQuery("get", "/repos/{owner}/{repo}/not-a-path");
}
