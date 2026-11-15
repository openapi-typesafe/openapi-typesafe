import createClient, { type FetchOptions } from "openapi-typesafe-fetch";
import type { FilterKeys, PathsWithMethod } from "openapi-typesafe-helpers";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js";

/**
 * Wrappers generic in the path that always read the body with one `parseAs` get the body of that
 * `parseAs` as `data`, as in openapi-fetch, not every JSON body of the paths. Checked, never run.
 */

type GetPath = PathsWithMethod<paths, "get">;
type GetInit<Path extends GetPath> = FetchOptions<FilterKeys<paths[Path], "get">>;

const client = createClient<paths>({ baseUrl: "https://api.github.com" });

export async function getText<Path extends GetPath>(
  path: Path,
  init: GetInit<Path>,
): Promise<string | undefined> {
  const { data } = await client.GET(path, { ...init, parseAs: "text" });
  return data;
}

export async function getBlob<Path extends GetPath>(
  path: Path,
  init: GetInit<Path> & { parseAs: "blob" },
): Promise<Blob | undefined> {
  const { data } = await client.GET(path, init);
  return data;
}

type ItemPaths = {
  "/items": {
    get: {
      parameters: Record<never, never>;
      responses: {
        200: { headers: Record<never, never>; content: { "application/json": string[] } };
      };
    };
  };
};
type ItemInit = FetchOptions<FilterKeys<ItemPaths["/items"], "get">>;

const itemClient = createClient<ItemPaths>({ baseUrl: "https://api.example.com" });

/** An init generic in its type may carry any `parseAs` its caller picks, so `data` is any body. */
export async function getItems<Init extends ItemInit>(init: Init): Promise<unknown> {
  const { data } = await itemClient.GET("/items", init);
  // @ts-expect-error a caller may pass parseAs: "text", so data is not only the JSON body
  const json: string[] | undefined = data;
  return json;
}
