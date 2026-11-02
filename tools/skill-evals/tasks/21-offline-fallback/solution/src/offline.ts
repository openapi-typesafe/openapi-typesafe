import type { Middleware } from "openapi-typesafe-fetch";

const SERVICE_UNAVAILABLE_STATUS = 503;
const OFFLINE_PROBLEM = { code: "offline", message: "The network is unavailable" };

/** Turns a request that could not be sent into a 503 response with an `offline` problem. */
export const offlineMiddleware: Middleware = {
  onError() {
    return Response.json(OFFLINE_PROBLEM, { status: SERVICE_UNAVAILABLE_STATUS });
  },
};
