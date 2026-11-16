import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { TypeEvaluator } from "../../../../src/application/transform/footer/type-evaluation.js";
import {
  irBoolean,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irNumber,
  irObject,
  irProperty,
  irReference,
  irString,
  irStringIndexSignature,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

/**
 * The evaluator outside `FlattenedDeepRequired`, as the `$ref` pointer checks of ADR-026 read
 * the written types: intersections as TypeScript normalizes them, optional values, `NonNullable`,
 * `Omit` and `WithRequired`.
 */

const text = (value: string) => irString(value, "json");
const key = (value: string) => irString(value, "escaped");
const name = (value: string) => ({ kind: "identifier", text: value }) as const;
const optional = (property: string, type: IrType) =>
  irProperty(name(property), type, { isOptional: true });
const required = (property: string, type: IrType) => irProperty(name(property), type);
const NULL = irKeyword("null");
const NEVER_RECORD = irReference("Record", [irKeyword("string"), irKeyword("never")]);
const EMAIL = irObject([optional("email", irKeyword("string"))]);

const DECLARATIONS: IrDeclaration[] = [
  {
    kind: "typeAlias",
    name: "Email",
    isExported: false,
    type: EMAIL,
    comments: [],
  },
];

function evaluated(type: IrType): string {
  const result = new TypeEvaluator(DECLARATIONS).evaluate(type);
  if (result.kind !== "type") {
    return result.kind;
  }
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: result.type }]).slice("type T = ".length, -2);
}

const at = (type: IrType, ...keys: string[]) =>
  keys.reduce<IrType>((owner, index) => irIndexedAccess(owner, key(index)), type);

describe("TypeEvaluator outside FlattenedDeepRequired", () => {
  it("evaluate reads an optional property as possibly undefined", () => {
    const owner = irObject([optional("next", EMAIL)]);

    expect(evaluated(at(owner, "next", "email"))).toBe("missing");
    expect(evaluated(at(irReference("NonNullable", [at(owner, "next")]), "email"))).toBe(
      "string | undefined",
    );
  });

  it("evaluate intersects the index signatures of nested intersection parts", () => {
    const signature = irObject([irStringIndexSignature("key", irKeyword("unknown"))]);
    const owner = irIntersection([irIntersection([EMAIL, signature]), NEVER_RECORD]);

    expect(evaluated(at(owner, "other", "0"))).toBe("never");
  });

  it("evaluate reads an intersection with never or different primitives as never", () => {
    const withNever = irIntersection([EMAIL, irKeyword("never")]);
    const primitives = irIntersection([irKeyword("string"), irKeyword("number")]);
    const literals = irIntersection([text("a"), irKeyword("number")]);
    const numbers = irIntersection([irNumber(1), irKeyword("string")]);
    const booleans = irIntersection([irBoolean(true), irKeyword("string")]);

    expect(evaluated(at(withNever, "other"))).toBe("never");
    expect(evaluated(at(primitives, "other"))).toBe("never");
    expect(evaluated(at(literals, "other"))).toBe("never");
    expect(evaluated(at(numbers, "other"))).toBe("never");
    expect(evaluated(at(booleans, "other"))).toBe("never");
  });

  it("evaluate keeps an intersection of one primitive", () => {
    const strings = irIntersection([irKeyword("string"), text("a")]);

    expect(evaluated(at(strings, "other"))).toBe("missing");
  });

  it("evaluate drops intersections with null from NonNullable", () => {
    const owner = irIntersection([irUnion([EMAIL, NULL]), irUnion([NEVER_RECORD, NULL])]);
    const onlyNull = irIntersection([NULL, irUnion([NULL, NEVER_RECORD])]);

    expect(evaluated(at(irReference("NonNullable", [owner]), "email"))).toBe("string | undefined");
    expect(evaluated(at(irReference("NonNullable", [onlyNull]), "email"))).toBe("never");
  });

  it("evaluate reads Omit of a union with null as an object without keys", () => {
    const omitted = irReference("Omit", [irUnion([EMAIL, NULL]), text("kind")]);

    expect(evaluated(omitted)).toBe("{}");
    expect(evaluated(at(omitted, "email"))).toBe("missing");
  });

  it("evaluate reads the keys WithRequired requires as present", () => {
    const owner = irObject([optional("next", EMAIL)]);
    const withNext = irReference("WithRequired", [owner, text("next")]);
    const withOther = irReference("WithRequired", [owner, irKeyword("string")]);
    const withSome = irReference("WithRequired", [
      owner,
      irUnion([text("next"), irKeyword("string")]),
    ]);

    expect(evaluated(at(withNext, "next", "email"))).toBe(
      "((string | undefined) & (string | undefined)) | never",
    );
    expect(evaluated(at(withOther, "next", "email"))).toBe("missing");
    expect(evaluated(at(withSome, "next", "email"))).toBe("missing");
    expect(evaluated(irReference("WithRequired", [text("r"), text("k")]))).toBe('"r"');
  });

  it("evaluate reads Exclude of undefined as the other members", () => {
    const owner = irObject([optional("next", irKeyword("string"))]);
    const excluded = (type: IrType, by: IrType) => irReference("Exclude", [type, by]);

    expect(evaluated(excluded(at(owner, "next"), irKeyword("undefined")))).toBe("string");
    expect(evaluated(excluded(at(owner, "next"), irKeyword("string")))).toBe("opaque");
    expect(evaluated(excluded(irReference("Unknown"), irKeyword("undefined")))).toBe("opaque");
    expect(evaluated(irReference("Exclude", [irKeyword("string")]))).toBe("opaque");
  });

  it("evaluate reads a required property without undefined", () => {
    const owner = irObject([required("next", EMAIL)]);

    expect(evaluated(at(owner, "next", "email"))).toBe("string | undefined");
    expect(evaluated(at(irReference("Email"), "email"))).toBe("string | undefined");
  });
});
