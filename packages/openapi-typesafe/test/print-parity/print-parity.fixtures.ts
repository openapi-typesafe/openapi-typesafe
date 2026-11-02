import {
  irArray,
  irBoolean,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irNumber,
  irObject,
  irProperty,
  irReadonly,
  irRecord,
  irReference,
  irString,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../src/domain/ir/constructors.js";
import type { IrComment, IrDeclaration, IrType } from "../../src/domain/ir/nodes.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";

/** Hand-written IR cases for the printer parity test; each one targets one printing rule. */

const alias = (name: string, type: IrType, comments: readonly IrComment[] = []): IrDeclaration => ({
  kind: "typeAlias",
  name,
  isExported: true,
  type,
  comments,
});

const block = (text: string): IrComment => ({ kind: "block", text });
const line = (text: string): IrComment => ({ kind: "line", text });
const STRING = irKeyword("string");
const NUMBER = irKeyword("number");

export const TYPE_CASES: Readonly<Record<string, IrType>> = {
  "every keyword": irUnion(
    (["string", "number", "boolean", "null", "undefined", "unknown", "never"] as const).map(
      irKeyword,
    ),
  ),
  "json strings keep non-ASCII": irUnion([
    irString('a"b\\c\n\t', "json"),
    irString("héllo ☃ 😀", "json"),
  ]),
  "escaped strings escape non-ASCII and controls": irUnion([
    irString('a"b\\c\n\t\r\v\f\b', "escaped"),
    irString("héllo ☃ 😀   \u0085 \u0001", "escaped"),
    irString("\u00001 and \u0000x", "escaped"),
  ]),
  numbers: irUnion([
    irNumber(0),
    irNumber(-0),
    irNumber(1.5),
    irNumber(-2),
    irNumber(1e21),
    irNumber(-1e-7),
  ]),
  booleans: irUnion([irBoolean(true), irBoolean(false)]),
  references: irUnion([
    irReference("components"),
    irRecord(STRING, irKeyword("never")),
    irReference("A", [STRING]),
  ]),
  "array of union and of readonly": irUnion([
    irArray(irUnion([STRING, NUMBER])),
    irArray(irReadonly(irArray(STRING))),
  ]),
  "nested unions and intersections": irIntersection([
    irUnion([STRING, irUnion([NUMBER, irKeyword("null")])]),
    irIntersection([irReference("A"), irReference("B")]),
  ]),
  "single-member union in array": irArray(irUnion([STRING])),
  "empty union and intersection": irUnion([irUnion([]), irIntersection([])]),
  "readonly operands": irUnion([
    irReadonly(irUnion([STRING, NUMBER])),
    irReadonly(irArray(STRING)),
  ]),
  "indexed access": irIndexedAccess(
    irIndexedAccess(irReference("components"), irString("schemas", "escaped")),
    irString("Pét", "escaped"),
  ),
  "indexed access on union": irIndexedAccess(
    irUnion([irReference("A"), irReference("B")]),
    irString("x", "escaped"),
  ),
  tuples: irUnion([
    irTuple([irTupleElement(STRING), irTupleElement(irArray(NUMBER), true)]),
    irTuple([]),
    irTuple([irTupleElement(irObject([irProperty(toPropertyName("a"), STRING)]))]),
  ]),
  "objects and property names": irObject([
    irProperty(toPropertyName("plain"), STRING),
    irProperty(toPropertyName("needs-quotes"), STRING, { isOptional: true }),
    irProperty(toPropertyName("ünïcode"), STRING, { isReadonly: true }),
    irProperty(toPropertyName(42), NUMBER),
    irProperty(toPropertyName("007"), NUMBER),
    irProperty(toPropertyName(-1), NUMBER),
    irProperty(
      toPropertyName("nested"),
      irObject([irProperty(toPropertyName("deep"), irObject([]))]),
    ),
    {
      kind: "indexSignature",
      parameterName: "key",
      parameterType: STRING,
      type: irUnion([STRING, irKeyword("undefined")]),
      isReadonly: true,
      comments: [],
    },
  ]),
  "member comments": irObject([
    irProperty(toPropertyName("a"), STRING, { comments: [block("* Format: int64 ")] }),
    irProperty(toPropertyName("b"), STRING, {
      comments: [
        block("*\n * @description Line one\n *     line two\n *\n *     \tafter blank\n "),
      ],
    }),
    irProperty(
      toPropertyName("c"),
      irObject([irProperty(toPropertyName("d"), STRING, { comments: [block("* deep ")] })]),
    ),
    irProperty(toPropertyName("e"), STRING, {
      comments: [block("* carriage\r return and   separator ")],
    }),
    irProperty(toPropertyName("f"), STRING, { comments: [block("*\n\n\t  \n * blank lines\n ")] }),
    irProperty(toPropertyName("g"), STRING, { comments: [line(" line comment")] }),
    irProperty(toPropertyName("h"), STRING, {
      comments: [block("*\n * @minimum 0\n "), block("* Format: int32 ")],
    }),
  ]),
};

export const DECLARATION_CASES: Readonly<Record<string, readonly IrDeclaration[]>> = {
  "empty file": [],
  "interfaces, empty and with members": [
    { kind: "interface", name: "paths", isExported: true, members: [], comments: [] },
    {
      kind: "interface",
      name: "components",
      isExported: false,
      members: [irProperty(toPropertyName("schemas"), irObject([]))],
      comments: [block("* top-level comment ")],
    },
  ],
  "type aliases": [
    alias("webhooks", irRecord(STRING, irKeyword("never"))),
    alias("$defs", STRING, [line(" note")]),
  ],
  enums: [
    { kind: "enum", name: "Empty", isExported: true, members: [], comments: [] },
    {
      kind: "enum",
      name: "Status",
      isExported: true,
      comments: [],
      members: [
        { name: "Active", value: "active", comments: [] },
        { name: "ValueMinus1", value: -1, comments: [line(" minus one")] },
        { name: '"quoted name"', value: "ünïcode", comments: [line(" multi\nline")] },
        { name: "Value2", value: 2.5, comments: [] },
      ],
    },
  ],
  "const arrays": [
    {
      kind: "constArray",
      name: "statusValues",
      isExported: true,
      type: irArray(STRING),
      values: ["a", "ü"],
      comments: [],
    },
    {
      kind: "constArray",
      name: "codes",
      isExported: false,
      type: irReadonly(irArray(NUMBER)),
      values: [1, -2],
      comments: [],
    },
    {
      kind: "constArray",
      name: "none",
      isExported: true,
      type: irArray(irKeyword("never")),
      values: [],
      comments: [],
    },
  ],
};

export { alias };
