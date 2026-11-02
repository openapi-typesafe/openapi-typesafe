import type { Clock } from "../application/ports.ts";

/** The real clock. `Date` is timezone-free; callers format it with `toISOString()` (UTC). */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
