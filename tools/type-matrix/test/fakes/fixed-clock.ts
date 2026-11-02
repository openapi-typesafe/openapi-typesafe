import type { Clock } from "../../src/application/ports.ts";

/** A clock that always returns one UTC instant. */
export class FixedClock implements Clock {
  readonly #now: Date;

  constructor(isoUtc: string) {
    if (!isoUtc.endsWith("Z")) {
      throw new Error(`FixedClock needs a UTC timestamp ending in Z, got ${isoUtc}`);
    }
    this.#now = new Date(isoUtc);
  }

  now(): Date {
    return new Date(this.#now);
  }
}
