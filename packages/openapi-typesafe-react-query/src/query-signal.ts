/**
 * The signal of a query's request. TanStack Query gives every request a signal, which it aborts
 * when the query is cancelled or no longer used; the init of the call may bring its own. The hooks
 * sent one of them: `useQuery` the call's, so a cancelled query kept its request, and
 * `useInfiniteQuery` TanStack's, so the call's signal did nothing. The request now stops when
 * either is aborted.
 */

/** The init to send, and how to stop listening to the signals once the request has settled. */
export interface QueryRequest {
  readonly init: Record<string, unknown>;
  readonly release: () => void;
}

const ABORT_EVENT = "abort";

function withoutRelease(init: Record<string, unknown>): QueryRequest {
  return { init, release: () => undefined };
}

/** The init with a signal that aborts when the init's own signal or the query's does. */
export function withQuerySignal(init: unknown, querySignal: AbortSignal): QueryRequest {
  const { signal: ownSignal, ...rest } = (init ?? {}) as { signal?: AbortSignal | null };
  if (!ownSignal) {
    return withoutRelease({ ...rest, signal: querySignal });
  }
  const controller = new AbortController();
  const sources = [ownSignal, querySignal];
  const aborted = sources.find((source) => source.aborted);
  if (aborted !== undefined) {
    controller.abort(aborted.reason);
    return withoutRelease({ ...rest, signal: controller.signal });
  }
  const listeners = sources.map((source) => {
    const listener = () => controller.abort(source.reason);
    source.addEventListener(ABORT_EVENT, listener, { once: true });
    return () => source.removeEventListener(ABORT_EVENT, listener);
  });
  return {
    init: { ...rest, signal: controller.signal },
    release: () => {
      for (const remove of listeners) {
        remove();
      }
    },
  };
}
