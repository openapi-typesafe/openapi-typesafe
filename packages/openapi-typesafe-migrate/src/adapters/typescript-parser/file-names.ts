import ts from "@typescript/typescript6";
import type { FactoryNames } from "./factory-type-text.js";

/** What the rewriter needs to know about a file's imports and module-level constants. */
export interface FileNames extends FactoryNames {
  /** Local names of the generator's default export (`openapiTS` in `import openapiTS from …`). */
  readonly generatorFunctions: ReadonlySet<string>;
  /** Module-level function declarations, and `const` bindings of function expressions, by name. */
  readonly functions: ReadonlyMap<string, ts.FunctionLikeDeclaration>;
}

/** The generator after the specifier rename, and before it, for files the rename skipped. */
const GENERATOR_MODULES: ReadonlySet<string> = new Set(["openapi-typesafe", "openapi-typescript"]);
const TYPESCRIPT_MODULES: ReadonlySet<string> = new Set(["typescript", "@typescript/typescript6"]);

interface MutableNames {
  readonly typescriptModules: Set<string>;
  readonly typescriptImports: Map<string, string>;
  readonly helperImports: Map<string, string>;
  readonly constants: Map<string, ts.Expression>;
  readonly generatorFunctions: Set<string>;
  readonly functions: Map<string, ts.FunctionLikeDeclaration>;
}

function namedImports(clause: ts.ImportClause, into: Map<string, string>): void {
  const bindings = clause.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return;
  }
  for (const element of bindings.elements) {
    into.set(element.name.text, (element.propertyName ?? element.name).text);
  }
}

function addTypescriptImport(clause: ts.ImportClause, names: MutableNames): void {
  if (clause.name !== undefined) {
    names.typescriptModules.add(clause.name.text);
  }
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
    names.typescriptModules.add(bindings.name.text);
  }
  namedImports(clause, names.typescriptImports);
}

function addGeneratorImport(clause: ts.ImportClause, names: MutableNames): void {
  if (clause.name !== undefined) {
    names.generatorFunctions.add(clause.name.text);
  }
  namedImports(clause, names.helperImports);
}

function addImport(statement: ts.ImportDeclaration, names: MutableNames): void {
  const clause = statement.importClause;
  if (clause === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) {
    return;
  }
  const specifier = statement.moduleSpecifier.text;
  if (TYPESCRIPT_MODULES.has(specifier)) {
    addTypescriptImport(clause, names);
  } else if (GENERATOR_MODULES.has(specifier)) {
    addGeneratorImport(clause, names);
  }
}

function addConstants(statement: ts.VariableStatement, names: MutableNames): void {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
    return;
  }
  for (const declaration of statement.declarationList.declarations) {
    const initializer = declaration.initializer;
    if (!ts.isIdentifier(declaration.name) || initializer === undefined) {
      continue;
    }
    names.constants.set(declaration.name.text, initializer);
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      names.functions.set(declaration.name.text, initializer);
    }
  }
}

/** The imports and module-level `const` declarations of a source file. */
export function collectFileNames(file: ts.SourceFile): FileNames {
  const names: MutableNames = {
    typescriptModules: new Set(),
    typescriptImports: new Map(),
    helperImports: new Map(),
    constants: new Map(),
    generatorFunctions: new Set(),
    functions: new Map(),
  };
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      addImport(statement, names);
    } else if (ts.isVariableStatement(statement)) {
      addConstants(statement, names);
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      names.functions.set(statement.name.text, statement);
    }
  }
  return names;
}
