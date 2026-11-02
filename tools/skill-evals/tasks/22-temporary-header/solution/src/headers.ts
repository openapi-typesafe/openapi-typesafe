import type { Client, Middleware } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

/** Run `run` with an extra header on every request of `client`; the header goes away after. */
export async function withHeader<T>(
  client: Client<paths>,
  name: string,
  value: string,
  run: () => Promise<T>,
): Promise<T> {
  const headerMiddleware: Middleware = {
    onRequest({ request }) {
      request.headers.set(name, value);
      return request;
    },
  };
  client.use(headerMiddleware);
  try {
    return await run();
  } finally {
    client.eject(headerMiddleware);
  }
}
