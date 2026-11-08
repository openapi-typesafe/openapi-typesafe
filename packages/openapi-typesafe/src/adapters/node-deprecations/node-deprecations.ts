import { deprecate } from "node:util";
import type { DeprecationReporter } from "../../application/ports/deprecation-reporter.js";

/**
 * Deprecations as Node.js `DeprecationWarning`s. `util.deprecate` warns once per process for each
 * code, also across wrappers, and honours `--no-deprecation` and `--throw-deprecation`.
 */
export function createNodeDeprecationReporter(): DeprecationReporter {
  return {
    report(code, message) {
      deprecate(() => undefined, message, code)();
    },
  };
}
