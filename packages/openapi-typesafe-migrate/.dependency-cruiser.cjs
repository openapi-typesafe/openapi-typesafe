/**
 * Layer rules for the migration command (ENGINEERING_PLAN §4.1). Dependencies point inward only:
 *
 *   cli/  ->  application/  ->  domain/
 *   adapters/  ->  application/ ports, domain/
 */

/** Only the callback rewriter may load the TypeScript parser. */
const PARSER_ADAPTER = "^src/adapters/typescript-parser";

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
      comment: "Application code must not import adapters or cli.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: "^src/(adapters|cli)/" },
    },
    {
      name: "application-has-no-packages",
      comment: "Application code reaches files, the parser and the logger only through ports.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "core"] },
    },
    {
      name: "adapters-do-not-import-the-cli",
      comment: "Adapters implement ports; only cli/ wires them together.",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: { path: "^src/cli/" },
    },
    {
      name: "parser-only-in-its-adapter",
      comment: "The TypeScript parser is a runtime dependency of one adapter only.",
      severity: "error",
      from: { path: "^src/", pathNot: PARSER_ADAPTER },
      to: { path: "^@typescript/|node_modules/@typescript/" },
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
