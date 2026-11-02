import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";
import { ApiError } from "./errors";

/** The service status. Throws `ApiError` for every failed response, with or without a body. */
export async function getHealthStatus(client: Client<paths>): Promise<"ok" | "degraded"> {
  const { data, response } = await client.GET("/health");
  if (!response.ok || data === undefined) {
    throw new ApiError(response.status, `Health check failed: HTTP ${response.status}`);
  }
  return data.status;
}
