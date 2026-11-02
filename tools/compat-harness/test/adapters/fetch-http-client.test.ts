import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FetchHttpClient } from "../../src/adapters/fetch-http-client.ts";

/**
 * Normal requests get a generous timeout, so a loaded CI machine does not fail them. The timeout
 * test needs only that the server is much slower than the client's limit.
 */
const NORMAL_TIMEOUT_MS = 5_000;
const SHORT_TIMEOUT_MS = 100;
const SLOW_RESPONSE_MS = 2_000;

let server: Server;
let baseUrl: string;
const seenUserAgents: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    seenUserAgents.push(request.headers["user-agent"] ?? "");
    if (request.url === "/slow") {
      setTimeout(() => response.end("late"), SLOW_RESPONSE_MS);
      return;
    }
    response.statusCode = request.url === "/missing" ? 404 : 200;
    response.end(request.url === "/missing" ? "not found" : "document");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("FetchHttpClient", () => {
  const client = new FetchHttpClient({ timeoutMs: NORMAL_TIMEOUT_MS, userAgent: "harness-test" });
  const impatientClient = new FetchHttpClient({
    timeoutMs: SHORT_TIMEOUT_MS,
    userAgent: "harness-test",
  });

  it("getText returns the status and body and sends the user agent", async () => {
    expect(await client.getText(`${baseUrl}/ok`)).toEqual({ status: 200, body: "document" });
    expect(seenUserAgents.at(-1)).toBe("harness-test");
  });

  it("getText returns non-2xx responses instead of throwing", async () => {
    expect(await client.getText(`${baseUrl}/missing`)).toEqual({ status: 404, body: "not found" });
  });

  it("getText rejects when the server is slower than the timeout", async () => {
    await expect(impatientClient.getText(`${baseUrl}/slow`)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });
});
