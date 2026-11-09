import { defineBuildConfig } from "unbuild";

/** unbuild's plugin that rewrites the CommonJS declarations to `export = <default export>`. */
const CJS_DEFAULT_EXPORT_PLUGIN = "fix-dts-default-cjs-exports-plugin";

export default defineBuildConfig({
  entries: ["./src/index.js"],
  declaration: "compatible",
  clean: true,
  sourcemap: true,
  rollup: {
    // Ship CommonJS-compatible bundle
    emitCJS: true,
    // `exports: "named"` states what Rollup already picks for a module with both named and default
    // exports (`require()` returns `{ default, ...named }`); being explicit removes the build warning.
    output: { exports: "named" },
  },
  hooks: {
    // `require()` returns `{ default, ...named }`, so the CommonJS declarations keep the default
    // export. `export = createClient` declared a callable module that `require()` does not return,
    // and next to the named exports it is an error (TS2309) that a `@ts-ignore` hid.
    "rollup:dts:options"(_ctx, options) {
      const plugins = Array.isArray(options.plugins) ? options.plugins : [options.plugins];
      options.plugins = plugins.filter(
        (plugin) =>
          !(plugin && typeof plugin === "object" && "name" in plugin && plugin.name === CJS_DEFAULT_EXPORT_PLUGIN),
      );
    },
  },
});
