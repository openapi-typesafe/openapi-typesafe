/**
 * Layer rules for the generator (ENGINEERING_PLAN §4.1). Dependencies point inward only:
 *
 *   cli/, api/  ->  application/  ->  domain/
 *   adapters/   ->  application/ ports, domain/
 *
 * Legacy files (src/lib, src/transform, src/index.ts, src/types.ts) are outside the layers and are not
 * constrained until they are ported (Phase 5). The rules below apply from the first file in each layer.
 */

/** Only the optional legacy bridge may load the TypeScript compiler (ADR-002, ADR-004). */
const TYPE_AST_BRIDGE = "^src/adapters/type-ast-bridge/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-self-contained",
      comment: "Domain code imports only other domain modules: no layers above it and no packages.",
      severity: "error",
      from: { path: "^src/domain/" },
      to: { pathNot: ["^src/domain/"] },
    },
    {
      name: "application-depends-on-domain-only",
      comment: "Application code (use cases, transformers, printer, ports) must not import adapters, cli or api.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: "^src/(adapters|cli|api)/" },
    },
    {
      name: "application-has-no-packages",
      comment: "Application code is pure: external packages are reached only through ports implemented in adapters.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "core"] },
    },
    {
      name: "adapters-do-not-import-composition-roots",
      comment: "Adapters implement ports; only cli/ and api/ wire them together.",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: { path: "^src/(cli|api)/" },
    },
    {
      name: "layers-do-not-import-legacy-code",
      comment: "Ported code must not depend on unported legacy modules (it would keep them alive).",
      severity: "error",
      from: { path: "^src/(domain|application|adapters|cli|api)/" },
      to: { path: "^src/(lib|transform)/" },
    },
    {
      name: "typescript-only-in-bridge",
      comment:
        "No module except the legacy bridge may import the TypeScript compiler, not even its types " +
        "(ENGINEERING_PLAN 6.6). Other code takes the types from the bridge's typescript-types module.",
      severity: "error",
      from: { path: "^src/", pathNot: TYPE_AST_BRIDGE },
      to: { path: "^typescript$|node_modules/typescript/|^@typescript/|node_modules/@typescript/" },
    },
    {
      name: "no-circular",
      comment: "Circular imports make module order fragile and hide design problems.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment: "Every import must resolve.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
    },
  },
};
