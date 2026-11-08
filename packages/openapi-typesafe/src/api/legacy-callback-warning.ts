import { DEPRECATION_CODES, type DeprecationCode } from "../domain/deprecations.js";
import type { LegacyCallbackName } from "../types.js";
import { defaultDeprecationReporter } from "./default-ports.js";
import type { RunContext } from "./run-context.js";

/** Where the IR callbacks are documented; the warning points users there. */
export const IR_CALLBACKS_GUIDE_URL =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks";

const USES: Readonly<Record<LegacyCallbackName, string>> = {
  transform: "`transform` returned a TypeScript node",
  postTransform: "`postTransform` receives TypeScript nodes",
  transformProperty: "`transformProperty` receives TypeScript nodes",
};

const CODES: Readonly<Record<LegacyCallbackName, DeprecationCode>> = {
  transform: DEPRECATION_CODES.OPENAPI_TYPESAFE_DEP_TS_TRANSFORM,
  postTransform: DEPRECATION_CODES.OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM,
  transformProperty: DEPRECATION_CODES.OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY,
};

function message(name: LegacyCallbackName): string {
  return (
    `${USES[name]}. This form works in 1.x through the TypeScript bridge and is removed in 2.0. ` +
    `Use irCallbacks: true and return IR or type text instead: ${IR_CALLBACKS_GUIDE_URL}`
  );
}

/**
 * Report a deprecated callback form once per run and callback, as a deprecation (not through the
 * logger, so `silent` does not hide it). The Node.js reporter shows each code once per process.
 */
export function warnLegacyCallback(ctx: RunContext, name: LegacyCallbackName): void {
  ctx.legacyCallbackWarnings ??= new Set();
  if (ctx.legacyCallbackWarnings.has(name)) {
    return;
  }
  ctx.legacyCallbackWarnings.add(name);
  (ctx.deprecations ?? defaultDeprecationReporter()).report(CODES[name], message(name));
}
