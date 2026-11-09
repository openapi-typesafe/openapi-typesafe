import { describe, expect, it } from "vitest";
import { withQuerySignal } from "../src/query-signal.js";

describe("withQuerySignal", () => {
  it("withQuerySignal without a signal of the init sends the query's signal", () => {
    const query = new AbortController();

    const request = withQuerySignal({ params: {} }, query.signal);

    expect(request.init).toEqual({ params: {}, signal: query.signal });
  });

  it("withQuerySignal aborts the request when the init's own signal aborts", () => {
    const own = new AbortController();
    const query = new AbortController();
    const request = withQuerySignal({ signal: own.signal }, query.signal);

    own.abort("left the page");

    const signal = request.init.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("left the page");
    expect(query.signal.aborted).toBe(false);
  });

  it("withQuerySignal aborts the request when the query's signal aborts", () => {
    const own = new AbortController();
    const query = new AbortController();
    const request = withQuerySignal({ signal: own.signal }, query.signal);

    query.abort("cancelled");

    expect((request.init.signal as AbortSignal).reason).toBe("cancelled");
    expect(own.signal.aborted).toBe(false);
  });

  it("withQuerySignal with a signal that is aborted already sends an aborted signal", () => {
    const own = new AbortController();
    own.abort("before");

    const request = withQuerySignal({ signal: own.signal }, new AbortController().signal);

    expect((request.init.signal as AbortSignal).reason).toBe("before");
  });

  it("release stops listening, so a later abort does not reach the settled request", () => {
    const own = new AbortController();
    const request = withQuerySignal({ signal: own.signal }, new AbortController().signal);

    request.release();
    own.abort();

    expect((request.init.signal as AbortSignal).aborted).toBe(false);
  });
});
