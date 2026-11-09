import { defineBuildConfig } from "unbuild";

/**
 * Rollup's warning for a module without code. The package has no runtime code on purpose: its
 * module only names the helper types of `openapi-typesafe-fetch`, and the empty `index.mjs` and
 * `index.cjs` let `import` and `require()` of the package resolve. Every other warning stays.
 */
const EMPTY_BUNDLE_WARNING = "EMPTY_BUNDLE";

export default defineBuildConfig({
  entries: ["./src/index.ts"],
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
    "rollup:options"(_ctx, options) {
      const report = options.onwarn;
      options.onwarn = (warning, warn) => {
        if (warning.code === EMPTY_BUNDLE_WARNING) {
          return;
        }
        if (report) {
          report(warning, warn);
        } else {
          warn(warning);
        }
      };
    },
  },
});
