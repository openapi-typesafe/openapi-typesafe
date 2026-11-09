import { defineBuildConfig } from "unbuild";

/** unbuild's plugin that rewrites the CommonJS declarations to `export = <default export>`. */
const CJS_DEFAULT_EXPORT_PLUGIN = "fix-dts-default-cjs-exports-plugin";

/**
 * Packages whose declarations are copied into the published declarations of the client instead of
 * imported. Inferred types print a type by the module that declares it. Under Yarn PnP, TypeScript
 * prints `import("openapi-typesafe-helpers")` for a helper type, a package that a library using the
 * client does not depend on, so its declarations fail downstream with TS2307 (ADR-034).
 */
const INLINED_TYPE_PACKAGES: readonly string[] = ["openapi-typesafe-helpers"];

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
    // Declaration files are left to rollup-plugin-dts. esbuild compiled the inlined `.d.mts` of the
    // helpers (a workspace path, not under `node_modules`) to an empty module.
    esbuild: { exclude: /node_modules|\.d\.[cm]?ts$/ },
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
      const { external } = options;
      if (typeof external !== "function") {
        throw new Error("unbuild's rollup `external` is no longer a function; see build.config.ts");
      }
      options.external = (id, importer, isResolved) =>
        !INLINED_TYPE_PACKAGES.includes(id) && external(id, importer, isResolved);
    },
  },
});
