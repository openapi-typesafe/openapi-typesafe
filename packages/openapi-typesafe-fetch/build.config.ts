import { readFileSync } from "node:fs";
import ts from "typescript";
import { defineBuildConfig } from "unbuild";

/** unbuild's plugin that rewrites the CommonJS declarations to `export = <default export>`. */
const CJS_DEFAULT_EXPORT_PLUGIN = "fix-dts-default-cjs-exports-plugin";
/** The declarations of the entry, which hold the `reference lib` directives of the package. */
const ENTRY_DECLARATIONS = new URL("./src/index.d.ts", import.meta.url);

/**
 * The `/// <reference lib="…" />` directives of the entry declarations. rollup-plugin-dts keeps
 * `reference types` and `reference path` directives but drops `reference lib`, so a plugin writes
 * them at the top of every published declaration file.
 */
function libReferences(): string {
  const text = readFileSync(ENTRY_DECLARATIONS, "utf8");
  const source = ts.createSourceFile(ENTRY_DECLARATIONS.pathname, text, ts.ScriptTarget.Latest);
  const libraries = source.libReferenceDirectives.map((directive) => directive.fileName);
  return libraries.map((library) => `/// <reference lib="${library}" />`).join("\n");
}

/** Whether a Rollup plugin is unbuild's plugin that rewrites the CommonJS declarations. */
function isCjsDefaultExportPlugin(plugin: unknown): boolean {
  const isNamed = typeof plugin === "object" && plugin !== null && "name" in plugin;
  return isNamed && plugin.name === CJS_DEFAULT_EXPORT_PLUGIN;
}

export default defineBuildConfig({
  entries: ["./src/index.js"],
  declaration: "compatible",
  clean: true,
  sourcemap: true,
  rollup: {
    // Ship CommonJS-compatible bundle
    emitCJS: true,
    // `exports: "named"` states what Rollup already picks for a module with both named and default
    // exports (`require()` returns `{ default, ...named }`); being explicit removes the build
    // warning.
    output: { exports: "named" },
  },
  hooks: {
    // `require()` returns `{ default, ...named }`, so the CommonJS declarations keep the default
    // export. `export = createClient` declared a callable module that `require()` does not return,
    // and next to the named exports it is an error (TS2309) that a `@ts-ignore` hid. The last
    // plugin writes the `reference lib` directives.
    "rollup:dts:options"(_ctx, options) {
      const plugins = Array.isArray(options.plugins) ? options.plugins : [options.plugins];
      options.plugins = [
        ...plugins.filter((plugin) => !isCjsDefaultExportPlugin(plugin)),
        { name: "keep-lib-references", banner: libReferences },
      ];
    },
  },
});
