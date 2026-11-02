import type { HttpClient, HttpResponse } from "../application/ports.ts";

/** HttpClient over the global `fetch`. Each request is cancelled after `timeoutMs`. */
export class FetchHttpClient implements HttpClient {
  readonly #timeoutMs: number;
  readonly #userAgent: string;

  constructor(options: { readonly timeoutMs: number; readonly userAgent: string }) {
    this.#timeoutMs = options.timeoutMs;
    this.#userAgent = options.userAgent;
  }

  async getText(url: string): Promise<HttpResponse> {
    const response = await fetch(url, {
      headers: { "user-agent": this.#userAgent },
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    return { status: response.status, body: await response.text() };
  }
}
