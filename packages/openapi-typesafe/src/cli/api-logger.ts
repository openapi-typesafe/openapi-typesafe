import type { DebugGroup, Logger } from "../application/ports/logger.js";

/**
 * A logger whose lines name the API they are about. With several APIs in `redocly.yaml`, each is
 * loaded and linted in turn, and a problem line such as "Can't resolve $ref" is the same for
 * each, so without the name the user cannot tell which API it belongs to. The summary of a
 * failed API names it the same way (`API a: …`).
 */
export function apiLogger(logger: Logger, apiName: string): Logger {
  const prefix = `API ${apiName}: `;
  return {
    debug: (message: string, group?: DebugGroup, durationMs?: number) =>
      logger.debug(`${prefix}${message}`, group, durationMs),
    warn: (message: string) => logger.warn(`${prefix}${message}`),
    error: (message: string) => logger.error(`${prefix}${message}`),
  };
}
