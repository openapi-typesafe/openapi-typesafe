import type { GlobalContext, LegacyCallbackName } from "../types.js";
import { warn } from "./utils.js";

/** Where the IR callbacks are documented; the warning points users there. */
export const IR_CALLBACKS_GUIDE_URL =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks";

const USES: Readonly<Record<LegacyCallbackName, string>> = {
  transform: "`transform` returned a TypeScript node",
  postTransform: "`postTransform` receives TypeScript nodes",
  transformProperty: "`transformProperty` receives TypeScript nodes",
};

function message(name: LegacyCallbackName): string {
  return (
    `${USES[name]}. This form works in 1.x through the TypeScript bridge and is removed in 2.0. ` +
    `Use irCallbacks: true and return IR or type text instead: ${IR_CALLBACKS_GUIDE_URL}`
  );
}

/** Warn once per run and callback; `silent` runs record the use but print nothing. */
export function warnLegacyCallback(ctx: GlobalContext, name: LegacyCallbackName): void {
  ctx.legacyCallbackWarnings ??= new Set();
  if (ctx.legacyCallbackWarnings.has(name)) {
    return;
  }
  ctx.legacyCallbackWarnings.add(name);
  warn(message(name), ctx.silent);
}
