/**
 * Headers given as a one-shot iterable: an iterator such as `map.entries()` or a generator, or a
 * list with such an iterator as one of its pairs. Reading it uses it up, and a query sends many
 * requests from one init: a refetch, a retry, the next page, a mutation's retry. The fetch client
 * reads such headers once per call, so only the first request sent them. The hooks read them
 * once, when they get the init, into a list of `[name, value]` lists that every request, and the
 * key, reads again (ADR-046).
 */
import { attempt, hasSlotsOf } from "./key-read.js";

/** Turns an init into one whose headers can be read more than once. */
export type InitHeadersReader = <Init>(init: Init) => Init;

/** Whether a value is a one-shot iterable: its own iterator, as an iterator or a generator is. */
function isOneShot(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (attempt(() => {
      const iterate = (value as Partial<Iterable<unknown>>)[Symbol.iterator];
      return typeof iterate === "function" && iterate.call(value) === value;
    }) ??
      false)
  );
}

/**
 * Whether headers are pairs with a one-shot part: a one-shot list, or an array or a `Set` with a
 * one-shot pair. Headers with a `get` method (`Headers`, a `Map`) give a new iterator on every
 * read, as a record has none.
 */
function hasOneShotPairs(headers: unknown): headers is Iterable<unknown> {
  if (typeof headers !== "object" || headers === null) {
    return false;
  }
  if (typeof attempt(() => (headers as { get?: unknown }).get) === "function") {
    return false;
  }
  const isList = Array.isArray(headers) || hasSlotsOf(headers, Set);
  return isOneShot(headers) || (isList && Array.from(headers as Iterable<unknown>).some(isOneShot));
}

/** A pair as a list when it is an iterable object; else as it is, for the client to reject. */
function pairList(pair: unknown): unknown {
  const isIterable = typeof pair === "object" && pair !== null && Symbol.iterator in pair;
  return isIterable ? Array.from(pair as Iterable<unknown>) : pair;
}

/**
 * Pairs whose read throws, such as a generator that throws: each request throws the same error,
 * so the query reports it, as the fetch client does when it reads them itself.
 */
function failedPairs(error: unknown): Iterable<never> {
  return {
    [Symbol.iterator]: () => {
      throw error;
    },
  };
}

/** Each pair of `headers` read once, or the pairs that throw what reading them threw. */
function readPairs(headers: Iterable<unknown>): Iterable<unknown> {
  try {
    return Array.from(headers, pairList);
  } catch (error) {
    return failedPairs(error);
  }
}

/**
 * A reader of init headers for one client. Each one-shot list is read the first time an init
 * brings it and kept by the list, so the next render of a component that keeps the list
 * (`useMemo`), and a mutation's retry, which gets the same init, read the same pairs. Any other
 * init is returned as it is, so an object the caller changes is still read at each request.
 */
export function createInitHeadersReader(): InitHeadersReader {
  const readLists = new WeakMap<object, Iterable<unknown>>();
  return <Init>(init: Init): Init => {
    const headers = attempt(() => (init as { headers?: unknown } | undefined)?.headers);
    if (!hasOneShotPairs(headers)) {
      return init;
    }
    const pairs = readLists.get(headers) ?? readPairs(headers);
    readLists.set(headers, pairs);
    return { ...init, headers: pairs };
  };
}
