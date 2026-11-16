import { WARNING_CODES, warningText } from "../domain/warnings.js";
import { defaultLogger } from "./default-ports.js";
import { IR_CALLBACKS_GUIDE_URL } from "./legacy-callback-warning.js";
import type { RunContext } from "./run-context.js";

/**
 * Report, once per pass, that a `transform` without `irCallbacks: true` returned a value that is
 * neither a type node nor an object (type text, a number), at `path`. The original ignores such a
 * result and keeps the generated type, and code that relies on that keeps working, so it is a
 * warning, not an error: a user who meant type text learns that it needs `irCallbacks: true`.
 */
export function warnIgnoredCallbackResult(
  ctx: RunContext,
  path: string | undefined,
  result: unknown,
): void {
  if (ctx.isIgnoredCallbackResultReported === true) {
    return;
  }
  ctx.isIgnoredCallbackResultReported = true;
  const message =
    `transform at ${path} returned a ${typeof result}, which is ignored without ` +
    "irCallbacks: true: the schema keeps its generated type (later results like it are not " +
    `reported). Set irCallbacks: true to return type text: ${IR_CALLBACKS_GUIDE_URL}`;
  (ctx.logger ?? defaultLogger(ctx.silent)).warn(
    warningText(message, WARNING_CODES.CALLBACK_RESULT_IGNORED),
  );
}
