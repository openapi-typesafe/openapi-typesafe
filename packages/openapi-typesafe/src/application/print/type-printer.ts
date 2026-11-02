import { assertNever } from "../../domain/assert-never.js";
import type {
  IrIndexedAccessType,
  IrMember,
  IrPropertyName,
  IrTupleElement,
  IrType,
} from "../../domain/ir/nodes.js";
import { writeLeadingComment } from "./comment-writer.js";
import { printEscapedString, printNumberLiteral, printStringLiteral } from "./literal-text.js";
import type { TextWriter } from "./text-writer.js";

/**
 * Parenthesization contexts. Each predicate says when a child type needs parentheses; together they
 * reproduce the TypeScript factory's parenthesizer rules for the node kinds of the IR, so output
 * matches the original even when unions are nested (`A | (B | C)`).
 */
const isUnionOrIntersection = (type: IrType): boolean =>
  type.kind === "union" || type.kind === "intersection";
/** Union and intersection members (`parenthesizeConstituentTypeOf{Union,Intersection}Type`). */
const needsParensAsConstituent = isUnionOrIntersection;
/** Array element and indexed-access object (`parenthesizeNonArrayTypeOfPostfixType`). */
const needsParensAsPostfixOperand = (type: IrType): boolean =>
  type.kind === "readonly" || isUnionOrIntersection(type);
/** Operand of `readonly` (`parenthesizeOperandOfReadonlyTypeOperator`). */
const needsParensAsReadonlyOperand = needsParensAsPostfixOperand;

function writeTypeIn(
  writer: TextWriter,
  type: IrType,
  needsParens: (type: IrType) => boolean,
): void {
  if (!needsParens(type)) {
    writeType(writer, type);
    return;
  }
  writer.write("(");
  writeType(writer, type);
  writer.write(")");
}

/** Write a single-line list: `separator` between items, nothing for an empty list. */
function writeInlineList<T>(
  writer: TextWriter,
  items: readonly T[],
  separator: string,
  writeItem: (item: T) => void,
) {
  items.forEach((item, index) => {
    if (index > 0) {
      writer.write(separator);
    }
    writeItem(item);
  });
}

/**
 * Write a multi-line list the way the TypeScript printer does: a line break after the opening
 * token, one item per indented line, `delimiter` after every item but the last, and a line break
 * before the closing token. An empty list prints the line break only when `isLineBreakWhenEmpty`
 * (interfaces, enums and tuples do; object type literals print `{}`).
 */
export function writeMultiLineList<T>(
  writer: TextWriter,
  items: readonly T[],
  format: { readonly delimiter: string; readonly isLineBreakWhenEmpty: boolean },
  writeItem: (item: T) => void,
): void {
  if (items.length === 0) {
    if (format.isLineBreakWhenEmpty) {
      writer.writeLine();
    }
    return;
  }
  writer.writeLine();
  writer.increaseIndent();
  items.forEach((item, index) => {
    if (index > 0) {
      writer.write(format.delimiter);
      writer.writeLine();
    }
    writeItem(item);
  });
  writer.decreaseIndent();
  writer.writeLine();
}

function writePropertyName(writer: TextWriter, name: IrPropertyName): void {
  switch (name.kind) {
    case "identifier":
    case "number":
      writer.write(name.text);
      break;
    case "string":
      writer.write(printEscapedString(name.value));
      break;
    default:
      assertNever(name);
  }
}

/**
 * `[name: type]`. TypeScript prints index signature parameters as an indented list, so a multi-line
 * parameter type (an object or tuple) is indented one level deeper than the member.
 */
function writeIndexSignatureParameter(writer: TextWriter, name: string, type: IrType): void {
  writer.write(`[${name}: `);
  writer.increaseIndent();
  writeType(writer, type);
  writer.decreaseIndent();
  writer.write("]");
}

/** Write one member of an interface or object type, with its comment and trailing semicolon. */
export function writeMember(writer: TextWriter, member: IrMember): void {
  if (member.comment) {
    writeLeadingComment(writer, member.comment);
  }
  if (member.isReadonly) {
    writer.write("readonly ");
  }
  if (member.kind === "property") {
    writePropertyName(writer, member.name);
    writer.write(member.isOptional ? "?: " : ": ");
  } else {
    writeIndexSignatureParameter(writer, member.parameterName, member.parameterType);
    writer.write(": ");
  }
  writeType(writer, member.type);
  writer.write(";");
}

function writeTupleElement(writer: TextWriter, element: IrTupleElement): void {
  if (element.isRest) {
    writer.write("...");
  }
  writeType(writer, element.type);
}

function writeObjectType(writer: TextWriter, members: readonly IrMember[]): void {
  writer.write("{");
  writeMultiLineList(writer, members, { delimiter: "", isLineBreakWhenEmpty: false }, (member) =>
    writeMember(writer, member),
  );
  writer.write("}");
}

function writeTupleType(writer: TextWriter, elements: readonly IrTupleElement[]): void {
  writer.write("[");
  writeMultiLineList(writer, elements, { delimiter: ",", isLineBreakWhenEmpty: true }, (element) =>
    writeTupleElement(writer, element),
  );
  writer.write("]");
}

function writeReferenceType(
  writer: TextWriter,
  name: string,
  typeArguments: readonly IrType[],
): void {
  writer.write(name);
  if (typeArguments.length > 0) {
    writer.write("<");
    writeInlineList(writer, typeArguments, ", ", (argument) => writeType(writer, argument));
    writer.write(">");
  }
}

function writeIndexedAccessType(writer: TextWriter, type: IrIndexedAccessType): void {
  writeTypeIn(writer, type.object, needsParensAsPostfixOperand);
  writer.write("[");
  writeType(writer, type.index);
  writer.write("]");
}

function writeConstituents(writer: TextWriter, types: readonly IrType[], separator: string): void {
  writeInlineList(writer, types, separator, (member) =>
    writeTypeIn(writer, member, needsParensAsConstituent),
  );
}

type IrLeafType = Extract<
  IrType,
  { kind: "keyword" | "stringLiteral" | "numberLiteral" | "booleanLiteral" | "raw" }
>;

function printLeafType(type: IrLeafType): string {
  switch (type.kind) {
    case "keyword":
      return type.keyword;
    case "stringLiteral":
      return printStringLiteral(type.value, type.encoding);
    case "numberLiteral":
      return printNumberLiteral(type.value);
    case "booleanLiteral":
      return String(type.value);
    case "raw":
      return type.text;
    default:
      return assertNever(type);
  }
}

function writeArrayType(writer: TextWriter, element: IrType): void {
  writeTypeIn(writer, element, needsParensAsPostfixOperand);
  writer.write("[]");
}

function writeReadonlyType(writer: TextWriter, operand: IrType): void {
  writer.write("readonly ");
  writeTypeIn(writer, operand, needsParensAsReadonlyOperand);
}

/** Write a type at the writer's current position. */
export function writeType(writer: TextWriter, type: IrType): void {
  switch (type.kind) {
    case "keyword":
    case "stringLiteral":
    case "numberLiteral":
    case "booleanLiteral":
    case "raw":
      writer.write(printLeafType(type));
      break;
    case "reference":
      writeReferenceType(writer, type.name, type.typeArguments);
      break;
    case "array":
      writeArrayType(writer, type.element);
      break;
    case "indexedAccess":
      writeIndexedAccessType(writer, type);
      break;
    case "readonly":
      writeReadonlyType(writer, type.type);
      break;
    case "union":
      writeConstituents(writer, type.types, " | ");
      break;
    case "intersection":
      writeConstituents(writer, type.types, " & ");
      break;
    case "object":
      writeObjectType(writer, type.members);
      break;
    case "tuple":
      writeTupleType(writer, type.elements);
      break;
    default:
      assertNever(type);
  }
}
