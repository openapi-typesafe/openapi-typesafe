import { defineBuildConfig } from "unbuild";

/** unbuild's plugin that rewrites the CommonJS declarations to `export = <default export>`. */
const CJS_DEFAULT_EXPORT_PLUGIN = "fix-dts-default-cjs-exports-plugin";
const DEFAULT_EXPORT = /^export \{ (\w+) as default \};$/m;
const TYPE_EXPORTS = /^export type \{ ([^}]+) \};$/m;

/**
 * `require()` returns `createClient` itself (`module.exports = createClient`, ADR-022), so the
 * CommonJS declarations say `export = createClient`. Such a module may not export anything else
 * (TS2309, reported with `skipLibCheck: false`), so the exported types go into a namespace merged
 * with the function, where `import type { QueryKey } from` still finds them. unbuild's own rewrite
 * kept `export type { … }` next to `export =`, and also rewrote `index.d.ts`, which describes the
 * ES module of `main`.
 */
function cjsDeclarations() {
  return {
    name: "cjs-declarations",
    renderChunk(code: string, chunk: { fileName: string }) {
      const defaultExport = DEFAULT_EXPORT.exec(code);
      const typeExports = TYPE_EXPORTS.exec(code);
      if (!chunk.fileName.endsWith(".d.cts") || !defaultExport || !typeExports) {
        return null;
      }
      const name = defaultExport[1];
      const namespace = `declare namespace ${name} {\n  export { ${typeExports[1]} };\n}\nexport = ${name};`;
      const declarations = code.replace(TYPE_EXPORTS, "").replace(DEFAULT_EXPORT, namespace);
      return `${declarations.trimEnd()}\n`;
    },
  };
}

export default defineBuildConfig({
  entries: ["./src/index.ts"],
  declaration: "compatible",
  clean: true,
  sourcemap: true,
  rollup: {
    // Ship CommonJS-compatible bundle
    emitCJS: true,
  },
  hooks: {
    "rollup:dts:options"(_ctx, options) {
      const plugins = Array.isArray(options.plugins) ? options.plugins : [options.plugins];
      const kept = plugins.filter(
        (plugin) =>
          !(plugin && typeof plugin === "object" && "name" in plugin && plugin.name === CJS_DEFAULT_EXPORT_PLUGIN),
      );
      options.plugins = [...kept, cjsDeclarations()];
    },
  },
});
