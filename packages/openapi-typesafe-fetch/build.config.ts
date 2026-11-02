import { defineBuildConfig } from "unbuild";

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
});
