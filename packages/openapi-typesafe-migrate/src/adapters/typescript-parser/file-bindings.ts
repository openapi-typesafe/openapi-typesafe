import ts from "@typescript/typescript6";

/**
 * The module-level names of a file that the rewriter follows: the TypeScript module and its named
 * imports, the generator and its helpers, module-level `const`s and functions. Identifiers are
 * resolved by scope with the TypeScript checker, so a local `const DATE` inside a callback is not
 * the module's `DATE`, however it is spelled.
 */

export type Binding =
  /** `ts` in `import ts from "typescript"` or `import * as ts from "typescript"`. */
  | { readonly kind: "typescript-module" }
  /** `factory` in `import { factory } from "typescript"`, by its imported name. */
  | { readonly kind: "typescript-import"; readonly name: string }
  /** A named import from the generator (`tsUnion`, `NULL`), by its imported name. */
  | { readonly kind: "helper-import"; readonly name: string }
  /** The generator function: the default import of the generator module. */
  | { readonly kind: "generator-function" }
  /** A namespace import of the generator module; `ns.default` is the generator function. */
  | { readonly kind: "generator-module" }
  /** A module-level `const` with an initializer. */
  | { readonly kind: "constant"; readonly initializer: ts.Expression }
  /** A module-level function declaration. */
  | { readonly kind: "function"; readonly declaration: ts.FunctionDeclaration }
  /** A module-level type: an alias, an interface or a JSDoc `@typedef`. */
  | { readonly kind: "local-type"; readonly declaration: LocalTypeDeclaration };

export type LocalTypeDeclaration =
  | ts.TypeAliasDeclaration
  | ts.InterfaceDeclaration
  | ts.JSDocTypedefTag;

export interface FileBindings {
  /** Every binding of the file, by its declaration node. */
  readonly declarations: ReadonlyMap<ts.Node, Binding>;
  /** The declaration node an identifier refers to, if it is a binding of this file. */
  declarationOf(identifier: ts.Identifier): ts.Node | undefined;
  bindingOf(identifier: ts.Identifier): Binding | undefined;
  /** The identifiers that refer to a declaration, without the name it declares. */
  usesOf(declaration: ts.Node): readonly ts.Identifier[];
  /** True when the file imports the generator, so it may call it. */
  readonly hasGenerator: boolean;
}

/** True for a declaration with an `export` modifier (`export const`, `export function`). */
export const hasExportModifier = (declaration: ts.Node): boolean =>
  (ts.getCombinedModifierFlags(declaration as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

/** The generator after the specifier rename, and before it, for files the rename skipped. */
export const GENERATOR_MODULES: ReadonlySet<string> = new Set([
  "openapi-typesafe",
  "openapi-typescript",
]);
const TYPESCRIPT_MODULES: ReadonlySet<string> = new Set(["typescript", "@typescript/typescript6"]);
const DEFAULT_EXPORT = "default";

type BindingMap = Map<ts.Node, Binding>;

function addNamedImports(clause: ts.ImportClause, isGenerator: boolean, into: BindingMap): void {
  const bindings = clause.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return;
  }
  for (const element of bindings.elements) {
    const name = (element.propertyName ?? element.name).text;
    const binding: Binding = isGenerator
      ? name === DEFAULT_EXPORT
        ? { kind: "generator-function" }
        : { kind: "helper-import", name }
      : { kind: "typescript-import", name };
    into.set(element, binding);
  }
}

/** An `import` statement, or a JSDoc `@import` tag of a JavaScript file, which has its parts. */
type ImportForm = Pick<ts.ImportDeclaration, "importClause" | "moduleSpecifier">;

function addImport(statement: ImportForm, into: BindingMap): void {
  const clause = statement.importClause;
  const specifier = ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : "";
  const isGenerator = GENERATOR_MODULES.has(specifier);
  if (clause === undefined || (!isGenerator && !TYPESCRIPT_MODULES.has(specifier))) {
    return;
  }
  if (clause.name !== undefined) {
    into.set(clause, isGenerator ? { kind: "generator-function" } : { kind: "typescript-module" });
  }
  const namespace = clause.namedBindings;
  if (namespace !== undefined && ts.isNamespaceImport(namespace)) {
    const kind = isGenerator ? "generator-module" : "typescript-module";
    into.set(namespace, { kind });
  }
  addNamedImports(clause, isGenerator, into);
}

function addConstants(statement: ts.VariableStatement, into: BindingMap): void {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
    return;
  }
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
      into.set(declaration, { kind: "constant", initializer: declaration.initializer });
    }
  }
}

function addStatement(statement: ts.Statement, into: BindingMap): void {
  if (ts.isImportDeclaration(statement)) {
    addImport(statement, into);
  } else if (ts.isVariableStatement(statement)) {
    addConstants(statement, into);
  } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
    into.set(statement, { kind: "function", declaration: statement });
  } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
    into.set(statement, { kind: "local-type", declaration: statement });
  }
}

function collectBindings(file: ts.SourceFile): BindingMap {
  const bindings: BindingMap = new Map();
  for (const statement of file.statements) {
    addStatement(statement, bindings);
  }
  return bindings;
}

/** A compiler host that knows only the parsed file, so the file system is never read. */
export function singleFileHost(file: ts.SourceFile): ts.CompilerHost {
  return {
    getSourceFile: (name) => (name === file.fileName ? file : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === file.fileName,
    readFile: () => undefined,
  };
}

/**
 * A checker for this one file: no default library and no module resolution, which binding names
 * by scope does not need.
 */
function createChecker(file: ts.SourceFile): ts.TypeChecker {
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, allowJs: true, types: [] };
  const host = singleFileHost(file);
  return ts.createProgram({ rootNames: [file.fileName], options, host }).getTypeChecker();
}

/**
 * The symbol of an identifier; `{ DATE }` refers to the variable, not to the new property, and
 * `export { DATE }` to the variable, not to the export alias, so an export counts as a use.
 */
function symbolOf(checker: ts.TypeChecker, identifier: ts.Identifier): ts.Symbol | undefined {
  const parent = identifier.parent;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === identifier) {
    return checker.getShorthandAssignmentValueSymbol(parent);
  }
  if (ts.isExportSpecifier(parent)) {
    return checker.getExportSpecifierLocalTargetSymbol(parent);
  }
  return checker.getSymbolAtLocation(identifier);
}

/** True for the name that a declaration of this file declares, and for names in imports. */
function isDeclaredName(identifier: ts.Identifier, declaration: ts.Node): boolean {
  const declaredName = (declaration as ts.NamedDeclaration).name;
  return (
    declaredName === identifier || ts.findAncestor(identifier, ts.isImportDeclaration) !== undefined
  );
}

/**
 * The binding of a JSDoc declaration of a JavaScript file: a `@typedef`, or a name of an
 * `@import`. The checker finds them in any JSDoc comment, so they are bound when a name refers to
 * one; TypeScript's API lists only the last JSDoc comment of a node.
 */
function addJSDocBinding(declaration: ts.Node, into: BindingMap): void {
  if (ts.isJSDocTypedefTag(declaration)) {
    into.set(declaration, { kind: "local-type", declaration });
    return;
  }
  const importTag = ts.findAncestor(declaration, ts.isJSDocImportTag);
  if (importTag !== undefined) {
    addImport(importTag, into);
  }
}

function indexUses(file: ts.SourceFile, bindings: FileBindings): Map<ts.Node, ts.Identifier[]> {
  const uses = new Map<ts.Node, ts.Identifier[]>();
  const visit = (node: ts.Node): void => {
    const declaration = ts.isIdentifier(node) ? bindings.declarationOf(node) : undefined;
    if (declaration !== undefined && !isDeclaredName(node as ts.Identifier, declaration)) {
      uses.set(declaration, [...(uses.get(declaration) ?? []), node as ts.Identifier]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return uses;
}

class CheckedFileBindings implements FileBindings {
  readonly hasGenerator: boolean;
  readonly #file: ts.SourceFile;
  readonly #bindings: BindingMap;
  readonly declarations: ReadonlyMap<ts.Node, Binding>;
  #checker: ts.TypeChecker | undefined;
  #uses: Map<ts.Node, ts.Identifier[]> | undefined;

  constructor(file: ts.SourceFile) {
    this.#file = file;
    this.#bindings = collectBindings(file);
    this.declarations = this.#bindings;
    this.hasGenerator = [...this.#bindings.values()].some(
      (binding) => binding.kind === "generator-function" || binding.kind === "generator-module",
    );
  }

  declarationOf(identifier: ts.Identifier): ts.Node | undefined {
    // The checker is built on first use: most files never call the generator.
    this.#checker ??= createChecker(this.#file);
    const declaration = symbolOf(this.#checker, identifier)?.declarations?.[0];
    if (declaration !== undefined && !this.#bindings.has(declaration)) {
      addJSDocBinding(declaration, this.#bindings);
    }
    return declaration !== undefined && this.#bindings.has(declaration) ? declaration : undefined;
  }

  bindingOf(identifier: ts.Identifier): Binding | undefined {
    const declaration = this.declarationOf(identifier);
    return declaration === undefined ? undefined : this.#bindings.get(declaration);
  }

  usesOf(declaration: ts.Node): readonly ts.Identifier[] {
    this.#uses ??= indexUses(this.#file, this);
    return this.#uses.get(declaration) ?? [];
  }
}

/** The bindings of a parsed file (parsed with parent pointers). */
export function createFileBindings(file: ts.SourceFile): FileBindings {
  return new CheckedFileBindings(file);
}
