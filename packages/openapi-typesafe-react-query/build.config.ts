import { defineBuildConfig } from "unbuild";

/** unbuild's plugin that rewrites the CommonJS declarations to `export = <default export>`. */
const CJS_DEFAULT_EXPORT_PLUGIN = "fix-dts-default-cjs-exports-plugin";
const VALUE_EXPORTS = /^export \{ ([^}]+) \};$/m;
const TYPE_EXPORTS = /^export type \{ ([^}]+) \};$/m;
const DEFAULT_SPECIFIER = /^(\w+) as default$/;

/**
 * `require()` returns `createClient` itself (ADR-022), with the named exports, such as
 * `isResponseError`, as its properties: `require(…).isResponseError` and
 * `const { isResponseError } = require(…)` work, as in the ES module. Rollup's named CommonJS
 * exports would return `{ default, isResponseError }` instead.
 */
const CJS_EXPORTS_FOOTER = "module.exports = Object.assign(exports.default, exports);";

/**
 * The CommonJS declarations say what `require()` returns: `export = createClient`. Such a module
 * may not export anything else (TS2309, reported with `skipLibCheck: false`), so the other exports
 * go into a namespace merged with the function, where `import type { QueryKey } from` and
 * `createClient.isResponseError` still find them. The namespace also declares `default`, which
 * the CommonJS footer sets to the function itself (`require(…).default`). unbuild's own rewrite
 * kept `export type { … }` next to `export =`, and also rewrote `index.d.ts`, which describes the
 * ES module of `main`.
 */
function cjsDeclarations() {
  return {
    name: "cjs-declarations",
    renderChunk(code: string, chunk: { fileName: string }) {
      const valueExports = VALUE_EXPORTS.exec(code);
      const typeExports = TYPE_EXPORTS.exec(code);
      if (!chunk.fileName.endsWith(".d.cts") || !valueExports || !typeExports) {
        return null;
      }
      const specifiers = valueExports[1]?.split(", ") ?? [];
      const name = specifiers
        .map((specifier) => DEFAULT_SPECIFIER.exec(specifier)?.[1])
        .find((match) => match !== undefined);
      if (!name) {
        throw new Error(`cjs-declarations: no default export in ${chunk.fileName}`);
      }
      const members = [...specifiers, typeExports[1]];
      const namespace = [
        `declare namespace ${name} {`,
        `  export { ${members.join(", ")} };`,
        "}",
        `export = ${name};`,
      ].join("\n");
      const declarations = code.replace(TYPE_EXPORTS, "").replace(VALUE_EXPORTS, namespace);
      return `${declarations.trimEnd()}\n`;
    },
  };
}

/** Whether a Rollup plugin is unbuild's plugin that rewrites the CommonJS declarations. */
function isCjsDefaultExportPlugin(plugin: unknown): boolean {
  const isNamed = typeof plugin === "object" && plugin !== null && "name" in plugin;
  return isNamed && plugin.name === CJS_DEFAULT_EXPORT_PLUGIN;
}

export default defineBuildConfig({
  entries: ["./src/index.ts"],
  declaration: "compatible",
  clean: true,
  sourcemap: true,
  rollup: {
    // Ship CommonJS-compatible bundle
    emitCJS: true,
    // `exports: "named"` is what Rollup picks for a default and named exports; the CommonJS footer
    // turns it into `createClient` with properties.
    output: { exports: "named" },
  },
  hooks: {
    "rollup:options"(_ctx, options) {
      const outputs = Array.isArray(options.output) ? options.output : [options.output ?? {}];
      options.output = outputs.map((output) =>
        output.format === "cjs" ? { ...output, footer: CJS_EXPORTS_FOOTER } : output,
      );
    },
    "rollup:dts:options"(_ctx, options) {
      const plugins = Array.isArray(options.plugins) ? options.plugins : [options.plugins];
      const kept = plugins.filter((plugin) => !isCjsDefaultExportPlugin(plugin));
      options.plugins = [...kept, cjsDeclarations()];
    },
  },
});
