import { assertNever } from "../../domain/assert-never.js";
import type {
  IrComment,
  IrConstArrayDeclaration,
  IrDeclaration,
  IrEnumDeclaration,
  IrEnumMember,
  IrInterfaceDeclaration,
  IrTypeAliasDeclaration,
} from "../../domain/ir/nodes.js";
import { writeLeadingComment } from "./comment-writer.js";
import { printEscapedString, printNumberLiteral } from "./literal-text.js";
import type { TextWriter } from "./text-writer.js";
import { writeMember, writeMultiLineList, writeType } from "./type-printer.js";

/** Enum initializers and array elements are expressions: strings use printer escaping. */
function printValue(value: string | number): string {
  return typeof value === "number" ? printNumberLiteral(value) : printEscapedString(value);
}

function writeHead(
  writer: TextWriter,
  declaration: { comment: IrComment | null; isExported: boolean },
): void {
  if (declaration.comment) {
    writeLeadingComment(writer, declaration.comment);
  }
  if (declaration.isExported) {
    writer.write("export ");
  }
}

function writeInterface(writer: TextWriter, declaration: IrInterfaceDeclaration): void {
  writeHead(writer, declaration);
  writer.write(`interface ${declaration.name} {`);
  writeMultiLineList(
    writer,
    declaration.members,
    { delimiter: "", isLineBreakWhenEmpty: true },
    (member) => writeMember(writer, member),
  );
  writer.write("}");
}

function writeTypeAlias(writer: TextWriter, declaration: IrTypeAliasDeclaration): void {
  writeHead(writer, declaration);
  writer.write(`type ${declaration.name} = `);
  writeType(writer, declaration.type);
  writer.write(";");
}

function writeEnumMember(writer: TextWriter, member: IrEnumMember): void {
  if (member.comment) {
    writeLeadingComment(writer, member.comment);
  }
  writer.write(`${member.name} = ${printValue(member.value)}`);
}

function writeEnum(writer: TextWriter, declaration: IrEnumDeclaration): void {
  writeHead(writer, declaration);
  writer.write(`enum ${declaration.name} {`);
  writeMultiLineList(
    writer,
    declaration.members,
    { delimiter: ",", isLineBreakWhenEmpty: true },
    (member) => writeEnumMember(writer, member),
  );
  writer.write("}");
}

function writeConstArray(writer: TextWriter, declaration: IrConstArrayDeclaration): void {
  writeHead(writer, declaration);
  writer.write(`const ${declaration.name}: `);
  writeType(writer, declaration.type);
  writer.write(` = [${declaration.values.map(printValue).join(", ")}];`);
}

/** Write one top-level declaration, starting on a new line. */
export function writeDeclaration(writer: TextWriter, declaration: IrDeclaration): void {
  writer.writeLine();
  switch (declaration.kind) {
    case "interface":
      writeInterface(writer, declaration);
      break;
    case "typeAlias":
      writeTypeAlias(writer, declaration);
      break;
    case "enum":
      writeEnum(writer, declaration);
      break;
    case "constArray":
      writeConstArray(writer, declaration);
      break;
    case "rawDeclaration":
      writer.write(declaration.text);
      break;
    default:
      assertNever(declaration);
  }
}
