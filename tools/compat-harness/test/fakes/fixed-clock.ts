import type { Clock } from "../../src/application/ports.ts";

/** Clock that always returns the same instant. */
export class FixedClock implements Clock {
  readonly #instant: Date;

  constructor(isoTimestamp: string) {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(isoTimestamp)) {
      throw new Error(`FixedClock needs a timestamp with a UTC offset, got ${isoTimestamp}`);
    }
    this.#instant = new Date(isoTimestamp);
  }

  now(): Date {
    return new Date(this.#instant);
  }
}
