import { defineBuildConfig } from "unbuild";

/**
 * Rollup warns when a module has both named and default exports. Here that is required by the
 * public API (`openapiTS` is the default export, helpers are named exports), and the CommonJS
 * shape Rollup picks for it ("auto") is the published shape that deep `require()` imports rely on.
 * Forcing `exports: "named"` would change that shape, so only this one warning code is filtered.
 */
const ACCEPTED_ROLLUP_WARNING_CODES = new Set(["MIXED_EXPORTS"]);

export default defineBuildConfig({
  // The CLI is not part of the public API; bin/cli.js imports dist/cli/main.mjs.
  entries: ["./src/index.ts", "./src/cli/main.ts"],
  declaration: "compatible",
  clean: true,
  sourcemap: true,
  rollup: {
    // Ship CommonJS-compatible bundle
    emitCJS: true,
    // Don’t bundle .js files together to more closely match old exports (can remove in next major)
    output: { preserveModules: true },
  },
  hooks: {
    "rollup:options"(_context, options) {
      const forwardWarning = options.onwarn;
      options.onwarn = (warning, defaultHandler) => {
        if (warning.code && ACCEPTED_ROLLUP_WARNING_CODES.has(warning.code)) {
          return;
        }
        if (forwardWarning) {
          forwardWarning(warning, defaultHandler);
        } else {
          defaultHandler(warning);
        }
      };
    },
  },
});
