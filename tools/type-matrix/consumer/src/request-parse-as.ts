import createClient from "openapi-typesafe-fetch";
import type { paths } from "../../../../packages/openapi-typesafe/examples/github-api.js";

/**
 * `parseAs` types `data` in `client.request()` as in `client.GET()`, on a large schema: the init's
 * literals keep their types while the method is not fixed yet. Checked, never run.
 */

const client = createClient<paths>({ baseUrl: "https://api.github.com" });

/** `true` only when the two types are the same: a JSON body would fit a wider annotation. */
type IsSame<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Repository = paths["/repos/{owner}/{repo}"]["get"]["responses"][200]["content"];

export async function readRepositoryText(owner: string, repo: string): Promise<boolean> {
  const { data } = await client.request("get", "/repos/{owner}/{repo}", {
    parseAs: "text",
    params: { path: { owner, repo } },
  });
  const isText: IsSame<typeof data, string | undefined> = true;
  return isText;
}

export async function lockIssueBlob(owner: string, repo: string): Promise<boolean> {
  const { data } = await client.request("put", "/repos/{owner}/{repo}/issues/{issue_number}/lock", {
    parseAs: "blob",
    params: { path: { owner, repo, issue_number: 1 } },
    body: { lock_reason: "resolved" },
  });
  const isBlob: IsSame<typeof data, Blob | undefined> = true;
  return isBlob;
}

/** A wrapper that passes on an optional `parseAs` gets the text or the JSON body. */
export async function readRepositoryAs(
  options: { parseAs?: "text" },
  path: { owner: string; repo: string },
): Promise<boolean> {
  const { data } = await client.GET("/repos/{owner}/{repo}", { ...options, params: { path } });
  const isTextOrJSON: IsSame<typeof data, string | Repository["application/json"] | undefined> =
    true;
  return isTextOrJSON;
}
