import ts from "typescript";
import type { WidenedEnumValuesArray } from "../domain/widened-enum-values.ts";
import { runChecker } from "./checker-limit.ts";

const FILE_NAME = "/__compat_harness__/enum-values.ts";

/** The options of the output compiler: the golden file is read as a user's `tsc` reads it. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

/** An `export const` array typed by its location, with its literal values. */
interface LocationTypedArray {
  readonly declaration: ts.VariableDeclaration;
  readonly typeNode: ts.TypeNode;
  readonly values: readonly ts.Expression[];
}

function isExported(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  return (modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Whether a type node is the `ReadonlyArray` helper of a location: the generator checks every
 * array typed so (also through `Extract<…>`), and one typed by its values already is not widened.
 */
function isLocationType(node: ts.TypeNode | undefined): node is ts.TypeReferenceNode {
  return (
    node !== undefined &&
    ts.isTypeReferenceNode(node) &&
    node.typeName.getText() === "ReadonlyArray" &&
    node.typeArguments?.length === 1
  );
}

function locationTypedArrays(sourceFile: ts.SourceFile): LocationTypedArray[] {
  const arrays: LocationTypedArray[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      const { type: typeNode, initializer } = declaration;
      if (isLocationType(typeNode) && initializer && ts.isArrayLiteralExpression(initializer)) {
        arrays.push({ declaration, typeNode, values: [...initializer.elements] });
      }
    }
  }
  return arrays;
}

/** The literal type of an array value (`"a"`, `5`, `-1`), or null for anything else. */
function literalTypeOf(checker: ts.TypeChecker, value: ts.Expression): ts.Type | null {
  if (ts.isStringLiteral(value)) {
    return checker.getStringLiteralType(value.text);
  }
  if (ts.isNumericLiteral(value)) {
    return checker.getNumberLiteralType(Number(value.text));
  }
  const isNegative =
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand);
  return isNegative ? checker.getNumberLiteralType(-Number(value.operand.text)) : null;
}

/**
 * An object type: an object, an array or a tuple, which admits values of its own kind. `{}` is one
 * too: the fixed `FlattenedDeepRequired` reads `unknown` as `NonNullable<unknown>`, which is `{}`
 * and admits every value but `null` and `undefined`; the generator reads it as `unknown`.
 */
function isObjectType(member: ts.Type): boolean {
  return (member.flags & ts.TypeFlags.Object) !== 0;
}

/**
 * Whether a member of the element type surely is a value the array does not list, as the
 * generator decides it: a string or number literal not listed (not an enum member), a boolean
 * (TypeScript reads `boolean` as `true | false`), `unknown`, or an object type. TypeScript has
 * reduced the type already, so `("a" | "b") & "a"` is `"a"` here, as the generator reads it too.
 */
function isOtherValue(member: ts.Type, values: ts.Type[]): boolean {
  if (isObjectType(member)) {
    return true;
  }
  if (member.flags & ts.TypeFlags.EnumLiteral) {
    return false;
  }
  if (member.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)) {
    return !values.includes(member);
  }
  return (member.flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Unknown)) !== 0;
}

function isWidened(checker: ts.TypeChecker, array: LocationTypedArray): boolean {
  const declared = checker.getTypeAtLocation(array.declaration.name);
  const element = checker.getIndexTypeOfType(declared, ts.IndexKind.Number);
  const values = array.values.map((value) => literalTypeOf(checker, value));
  if (element === undefined || values.some((value) => value === null)) {
    return false;
  }
  const literals = values as ts.Type[];
  if (!literals.every((literal) => checker.isTypeAssignableTo(literal, element))) {
    // The golden file does not compile here: that is a failure to report, not a rewrite.
    return false;
  }
  const members = element.isUnion() ? element.types : [element];
  return members.some((member) => isOtherValue(member, literals));
}

/**
 * Finds widened `--enum-values` arrays with the TypeScript checker. Lib files are parsed once
 * per finder, since every golden file reads the same ones.
 */
export class TypeScriptWidenedEnumValuesFinder {
  readonly #libFiles = new Map<string, ts.SourceFile | undefined>();
  readonly #host = ts.createCompilerHost(COMPILER_OPTIONS);

  readonly find = (text: string): readonly WidenedEnumValuesArray[] =>
    runChecker(FILE_NAME, () => this.#find(text));

  #find(text: string): WidenedEnumValuesArray[] {
    const sourceFile = ts.createSourceFile(FILE_NAME, text, ts.ScriptTarget.ES2022, true);
    const arrays = locationTypedArrays(sourceFile);
    if (arrays.length === 0) {
      return [];
    }
    const checker = this.#program(sourceFile).getTypeChecker();
    return arrays
      .filter((array) => isWidened(checker, array))
      .map(({ typeNode, values }) => ({
        typeStart: typeNode.getStart(sourceFile),
        typeEnd: typeNode.getEnd(),
        values: values.map((value) => value.getText(sourceFile)),
      }));
  }

  #program(sourceFile: ts.SourceFile): ts.Program {
    const host: ts.CompilerHost = {
      ...this.#host,
      getSourceFile: (fileName, ...rest) => {
        if (fileName === FILE_NAME) {
          return sourceFile;
        }
        if (!this.#libFiles.has(fileName)) {
          this.#libFiles.set(fileName, this.#host.getSourceFile(fileName, ...rest));
        }
        return this.#libFiles.get(fileName);
      },
    };
    return ts.createProgram([FILE_NAME], COMPILER_OPTIONS, host);
  }
}
