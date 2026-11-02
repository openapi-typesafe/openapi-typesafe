import { defineBuildConfig } from "unbuild";

/**
 * Rollup warns when a module has both named and default exports. Here that is required by the
 * public API (`openapiTS` is the default export, helpers are named exports), and the CommonJS
 * shape Rollup picks for it ("auto") is the published shape that deep `require()` imports rely on.
 * Forcing `exports: "named"` would change that shape, so only this one warning code is filtered.
 */
const ACCEPTED_ROLLUP_WARNING_CODES = new Set(["MIXED_EXPORTS"]);

/**
 * unbuild rewrites `export default` to `export =` in the `.d.cts` and `.d.ts` declarations. That
 * matches a CommonJS bundle whose `module.exports` is the default export. Ours has named exports
 * too, so `require()` returns `{ default, astToString, ... }`, and `export =` declared a shape the
 * runtime does not have (upstream #2047, #2155). The plugin is dropped to keep `export default`.
 */
const DTS_CJS_EXPORT_REWRITE_PLUGIN = "fix-dts-default-cjs-exports-plugin";

function isDtsCjsExportRewrite(plugin: unknown): boolean {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    (plugin as { name?: unknown }).name === DTS_CJS_EXPORT_REWRITE_PLUGIN
  );
}

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
    "rollup:dts:options"(_context, options) {
      const plugins = Array.isArray(options.plugins) ? options.plugins : [];
      options.plugins = plugins.filter((plugin) => !isDtsCjsExportRewrite(plugin));
    },
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
