import type { DeprecationCode } from "../../domain/deprecations.js";

/**
 * Where the generator reports the use of something 2.0 removes (ENGINEERING_PLAN 4.5). The
 * adapter decides how often a code is shown; the Node.js one shows each code once per process.
 */
export interface DeprecationReporter {
  report(code: DeprecationCode, message: string): void;
}
