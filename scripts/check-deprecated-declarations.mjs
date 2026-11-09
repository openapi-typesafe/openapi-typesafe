#!/usr/bin/env node
// Check that the built declarations of the package in the current directory keep the
// `@deprecated` JSDoc tag of every export that is deprecated in 1.x (ADR-004, decision 9), so
// editors strike them through. The declaration build drops comments when `removeComments` is on.
//
// Usage: node scripts/check-deprecated-declarations.mjs   (from a package directory, after build)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** The exports that must carry `@deprecated` in the declarations, by package and entry. */
const DEPRECATED_EXPORTS = {
  "openapi-typesafe": {
    index: [
      "stringToAST",
      "resolveRef",
      "scanDiscriminators",
      "walk",
      "c",
      "debug",
      "warn",
      "error",
      "addJSDocComment",
      "tsArrayLiteralExpression",
      "tsDedupe",
      "tsEnum",
      "tsEnumMember",
      "tsIsPrimitive",
      "tsModifiers",
      "tsPropertyIndex",
      "tsReadonlyArray",
      "QUESTION_TOKEN",
      "enumCache",
    ],
  },
  // The client declares the helper types in its `helpers` entry; the helpers package names them.
  "openapi-typesafe-fetch": {
    helpers: ["GetValueWithDefault", "FindRequiredKeys", "HasRequiredKeys"],
  },
  "openapi-typesafe-helpers": {
    index: ["GetValueWithDefault", "FindRequiredKeys", "HasRequiredKeys"],
  },
};

/** The declaration files of an entry: of the ES module and of the CommonJS module. */
const declarationFiles = (entry) => [`dist/${entry}.d.mts`, `dist/${entry}.d.cts`];

/** The exported names of `file` whose declaration has no `@deprecated` tag. */
function namesWithoutTag(file, names) {
  const program = ts.createProgram([file], { noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) {
    return names;
  }
  const exports = new Map(checker.getExportsOfModule(moduleSymbol).map((s) => [s.name, s]));
  return names.filter((name) => {
    const exported = exports.get(name);
    if (!exported) {
      return true;
    }
    const isAlias = (exported.flags & ts.SymbolFlags.Alias) !== 0;
    const symbol = isAlias ? checker.getAliasedSymbol(exported) : exported;
    return !symbol.getJsDocTags(checker).some((tag) => tag.name === "deprecated");
  });
}

function main() {
  const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const entries = DEPRECATED_EXPORTS[manifest.name];
  if (!entries) {
    return;
  }
  let failed = false;
  for (const [entry, names] of Object.entries(entries)) {
    for (const relative of declarationFiles(entry)) {
      const missing = namesWithoutTag(path.resolve(relative), names);
      if (missing.length > 0) {
        failed = true;
        const list = missing.join(", ");
        process.stderr.write(`check-deprecated: ${relative} has no @deprecated tag on ${list}\n`);
      }
    }
  }
  if (failed) {
    process.exit(1);
  }
  const count = Object.values(entries).flat().length;
  const summary = `${count} deprecated exports tagged in ${manifest.name}`;
  process.stdout.write(`check-deprecated: ${summary}\n`);
}

main();
