import type { Clock } from "../../src/application/ports.ts";

/** A UTC clock that moves forward by a fixed step on every read, so durations are known. */
export class SteppingClock implements Clock {
  #epochMs: number;
  readonly #stepMs: number;

  constructor(isoUtc: string, stepMs: number) {
    if (!isoUtc.endsWith("Z")) {
      throw new Error(`SteppingClock needs a UTC timestamp ending in Z, got ${isoUtc}`);
    }
    this.#epochMs = Date.parse(isoUtc);
    this.#stepMs = stepMs;
  }

  now(): Date {
    const now = new Date(this.#epochMs);
    this.#epochMs += this.#stepMs;
    return now;
  }
}
