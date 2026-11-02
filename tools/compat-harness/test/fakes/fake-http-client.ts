import type { HttpClient, HttpResponse } from "../../src/application/ports.ts";

/** One scripted reply: a response, or an error to reject with (a network failure). */
export type ScriptedReply = HttpResponse | Error;

/**
 * HttpClient that replays scripted replies per URL, in order; the last reply repeats. Unknown URLs get
 * a 404. Every request is recorded.
 */
export class FakeHttpClient implements HttpClient {
  readonly requests: string[] = [];
  readonly #replies: Map<string, ScriptedReply[]>;

  constructor(replies: Readonly<Record<string, ScriptedReply | readonly ScriptedReply[]>> = {}) {
    this.#replies = new Map(
      Object.entries(replies).map(([url, reply]) => [
        url,
        Array.isArray(reply) ? [...reply] : [reply],
      ]),
    );
  }

  async getText(url: string): Promise<HttpResponse> {
    this.requests.push(url);
    const queue = this.#replies.get(url);
    const reply = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (reply === undefined) {
      return { status: 404, body: "" };
    }
    if (reply instanceof Error) {
      throw reply;
    }
    return reply;
  }
}
