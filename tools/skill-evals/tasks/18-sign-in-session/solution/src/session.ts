import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** Log in, then send the access token with every later request of `client`. */
export async function signIn(
  client: Client<paths>,
  username: string,
  password: string,
): Promise<void> {
  const { data, response } = await client.POST("/auth/login", { body: { username, password } });
  if (!response.ok || data === undefined) {
    throw new Error(`Login failed: HTTP ${response.status}`);
  }
  const { accessToken } = data;
  client.use({
    onRequest({ request }) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
      return request;
    },
  });
}
