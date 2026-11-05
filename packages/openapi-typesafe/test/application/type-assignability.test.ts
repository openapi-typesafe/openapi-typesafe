import { describe, expect, it } from "vitest";
import {
  declaredTypeLookup,
  NO_DECLARED_TYPES,
} from "../../src/application/transform/document/declared-types.js";
import { assignabilityProof } from "../../src/application/transform/document/type-assignability.js";
import {
  irArray,
  irBoolean,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irNumber,
  irObject,
  irOptionalTupleElement,
  irProperty,
  irRaw,
  irReadonly,
  irReference,
  irString,
  irStringIndexSignature,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../src/domain/ir/constructors.js";
import type {
  IrDeclaration,
  IrIndexSignature,
  IrMember,
  IrType,
} from "../../src/domain/ir/nodes.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";

/** Which types the `--path-params-as-types` overlap check proves assignable (TS2411, TS2413). */

const STRING = irKeyword("string");
const NUMBER = irKeyword("number");
const NEVER = irKeyword("never");
const UNKNOWN = irKeyword("unknown");
const UNDEFINED = irKeyword("undefined");
const object = (...members: IrMember[]): IrType => irObject(members);
const required = (name: string, type: IrType = STRING) => irProperty(toPropertyName(name), type);
const optional = (name: string, type: IrType = STRING) =>
  irProperty(toPropertyName(name), type, { isOptional: true });
const literal = (value: string) => irString(value, "json");
const schema = (name: string) =>
  irIndexedAccess(
    irIndexedAccess(irReference("components"), irString("schemas", "escaped")),
    irString(name, "escaped"),
  );

const schemas = (members: Record<string, IrType>): IrDeclaration => ({
  kind: "interface",
  name: "components",
  isExported: true,
  members: [
    required(
      "schemas",
      irObject(Object.entries(members).map(([name, type]) => required(name, type))),
    ),
  ],
  comments: [],
});

const proof = (declarations: IrDeclaration[] = []) =>
  assignabilityProof(
    declarations.length === 0 ? NO_DECLARED_TYPES : declaredTypeLookup(declarations),
  );
const isAssignable = (source: IrType, target: IrType) => proof()(source, target);

describe("assignabilityProof: keywords, literals and unions", () => {
  it("assignabilityProof accepts any type for unknown and never for any type", () => {
    expect(isAssignable(STRING, UNKNOWN)).toBe(true);
    expect(isAssignable(NEVER, NUMBER)).toBe(true);
  });

  it("assignabilityProof accepts literals for their keyword and rejects other keywords", () => {
    expect(isAssignable(literal("a"), STRING)).toBe(true);
    expect(isAssignable(irNumber(1), NUMBER)).toBe(true);
    expect(isAssignable(irBoolean(true), irKeyword("boolean"))).toBe(true);
    expect(isAssignable(literal("a"), NUMBER)).toBe(false);
    expect(isAssignable(STRING, NUMBER)).toBe(false);
  });

  it("assignabilityProof accepts a union whose every member fits", () => {
    const target = irUnion([literal("a"), literal("b"), literal("c")]);

    expect(isAssignable(irUnion([literal("a"), literal("b")]), target)).toBe(true);
    expect(isAssignable(irUnion([literal("a"), literal("d")]), target)).toBe(false);
  });

  it("assignabilityProof compares arrays of literal unions by their items", () => {
    const names = irArray(irUnion([literal("id"), literal("name")]));

    expect(isAssignable(irArray(irUnion([literal("id"), literal("contentType")])), names)).toBe(
      false,
    );
    expect(isAssignable(irArray(literal("id")), names)).toBe(true);
  });

  it("assignabilityProof accepts a type it does not model only when it is the same", () => {
    const record = irReference("Record", [STRING, NEVER]);

    expect(isAssignable(record, irReference("Record", [STRING, NEVER]))).toBe(true);
    expect(isAssignable(record, irReference("Record", [STRING, UNKNOWN]))).toBe(false);
    expect(isAssignable(irRaw("A"), irRaw("A"))).toBe(true);
    expect(isAssignable(irRaw("A"), irRaw("B"))).toBe(false);
  });
});

describe("assignabilityProof: arrays, tuples and readonly", () => {
  it("assignabilityProof compares a tuple with an array by every element", () => {
    const tuple = irTuple([
      irTupleElement(literal("a")),
      irTupleElement(irArray(literal("b")), true),
    ]);

    expect(isAssignable(tuple, irArray(STRING))).toBe(true);
    expect(isAssignable(tuple, irArray(NUMBER))).toBe(false);
    expect(isAssignable(irArray(STRING), irTuple([irTupleElement(STRING)]))).toBe(false);
    expect(isAssignable(literal("a"), irArray(STRING))).toBe(false);
  });

  it("assignabilityProof compares tuples element by element, with the same shape", () => {
    const pair = irTuple([irTupleElement(literal("a")), irTupleElement(NUMBER)]);

    expect(isAssignable(pair, irTuple([irTupleElement(STRING), irTupleElement(NUMBER)]))).toBe(
      true,
    );
    expect(
      isAssignable(pair, irTuple([irTupleElement(STRING), irOptionalTupleElement(NUMBER)])),
    ).toBe(true);
    expect(isAssignable(pair, irTuple([irTupleElement(STRING)]))).toBe(false);
    expect(
      isAssignable(irTuple([irOptionalTupleElement(STRING)]), irTuple([irTupleElement(STRING)])),
    ).toBe(false);
  });

  it("assignabilityProof accepts a mutable array for a readonly one, not the other way", () => {
    expect(isAssignable(irArray(STRING), irReadonly(irArray(STRING)))).toBe(true);
    expect(isAssignable(irReadonly(irArray(literal("a"))), irReadonly(irArray(STRING)))).toBe(true);
    expect(isAssignable(irReadonly(irArray(STRING)), irArray(STRING))).toBe(false);
  });
});

describe("assignabilityProof: objects", () => {
  it("assignabilityProof needs every required property, with a fitting type", () => {
    const target = object(required("id"), optional("note"));

    expect(isAssignable(object(required("id", literal("a")), required("extra")), target)).toBe(
      true,
    );
    expect(isAssignable(object(optional("id")), target)).toBe(false);
    expect(isAssignable(object(required("note")), target)).toBe(false);
    expect(isAssignable(object(required("id", NUMBER)), target)).toBe(false);
  });

  it("assignabilityProof fills an empty slot only with undefined or nothing", () => {
    const target = object(optional("post", NEVER));

    expect(isAssignable(object(optional("post", NEVER)), target)).toBe(true);
    expect(isAssignable(object(required("post", object())), target)).toBe(false);
  });

  it("assignabilityProof rejects a source that shares no property with a weak type", () => {
    const weak = object(optional("a"), optional("b"));

    expect(isAssignable(object(required("c")), weak)).toBe(false);
    expect(isAssignable(object(required("a"), required("c")), weak)).toBe(true);
    expect(isAssignable(object(), weak)).toBe(true);
  });

  it("assignabilityProof checks every property and index against a string index", () => {
    const headers = object(irStringIndexSignature("name", UNKNOWN));
    const strings = object(irStringIndexSignature("name", STRING));

    expect(
      isAssignable(object(required("a", NUMBER), irStringIndexSignature("n", NUMBER)), headers),
    ).toBe(true);
    expect(isAssignable(object(required("a", NUMBER)), strings)).toBe(false);
    expect(isAssignable(object(irStringIndexSignature("n", NUMBER)), strings)).toBe(false);
  });

  it("assignabilityProof proves nothing for an index signature that is not a string index", () => {
    const template: IrIndexSignature = {
      ...irStringIndexSignature("path", STRING),
      parameterType: irRaw(`\`/a/\${string}\``),
    };

    expect(isAssignable(object(), object(template))).toBe(false);
    expect(isAssignable(object(template), object(irStringIndexSignature("n", STRING)))).toBe(false);
  });

  it("assignabilityProof checks a missing optional property against the source's string index", () => {
    const target = object(optional("a"));

    expect(isAssignable(object(irStringIndexSignature("n", literal("x"))), target)).toBe(true);
    expect(isAssignable(object(irStringIndexSignature("n", NUMBER)), target)).toBe(false);
  });

  it("assignabilityProof accepts an optional value for an optional property, undefined included", () => {
    expect(
      isAssignable(object(optional("a")), object(optional("a", irUnion([STRING, UNDEFINED])))),
    ).toBe(true);
    expect(
      isAssignable(object(optional("a")), object(required("a", irUnion([STRING, UNDEFINED])))),
    ).toBe(false);
  });
});

describe("assignabilityProof: intersections and references", () => {
  it("assignabilityProof merges an intersection of objects, a shared property into both types", () => {
    const merged = irIntersection([
      object(optional("a", literal("x"))),
      object(required("a"), required("b")),
    ]);

    expect(isAssignable(merged, object(required("a", literal("x")), required("b")))).toBe(true);
    expect(isAssignable(object(required("a", literal("x")), required("b")), merged)).toBe(true);
    expect(isAssignable(object(required("a", literal("y")), required("b")), merged)).toBe(false);
  });

  it("assignabilityProof accepts an intersection with a non-object part when one part fits", () => {
    const parts = irIntersection([object(required("a")), irRaw("Brand")]);

    expect(isAssignable(parts, object(required("a")))).toBe(true);
    expect(isAssignable(parts, object(required("b")))).toBe(false);
    expect(isAssignable(object(required("a")), parts)).toBe(false);
  });

  it("assignabilityProof reads references and their properties through the declarations", () => {
    const check = proof([
      schemas({
        Item: object(required("id")),
        List: irArray(schema("Item")),
        Tagged: irIntersection([schema("Item"), object(optional("tag"))]),
      }),
    ]);
    const tag = irIndexedAccess(schema("Tagged"), irString("tag", "escaped"));

    expect(check(schema("Tagged"), schema("Item"))).toBe(true);
    expect(check(schema("List"), schema("Item"))).toBe(false);
    expect(check(tag, irUnion([STRING, UNDEFINED]))).toBe(true);
    expect(check(tag, STRING)).toBe(false);
    expect(check(irIndexedAccess(schema("Tagged"), irString("missing", "escaped")), STRING)).toBe(
      false,
    );
    expect(check(irIndexedAccess(schema("List"), irString("id", "escaped")), STRING)).toBe(false);
  });

  it("assignabilityProof terminates on recursive types and relates them structurally", () => {
    const check = proof([
      schemas({
        Tree: object(optional("child", schema("Tree")), required("name")),
        Node: object(optional("child", schema("Node")), required("name", literal("n"))),
        Self: irIntersection([object(required("name")), schema("Self")]),
      }),
    ]);

    expect(check(schema("Node"), schema("Tree"))).toBe(true);
    expect(check(schema("Tree"), schema("Node"))).toBe(false);
    expect(check(schema("Self"), object(required("name")))).toBe(true);
  });

  it("assignabilityProof keeps no relation that rested on an outer pair that failed", () => {
    // B relates to A only if A relates to B; A does not (its `id` is a string), so neither holds.
    const check = proof([
      schemas({
        A: object(required("other", schema("B")), required("id", STRING)),
        B: object(required("other", schema("A")), required("id", NUMBER)),
      }),
    ]);
    const wrapped = (name: string) => object(required("value", schema(name)));

    expect(check(schema("A"), schema("B"))).toBe(false);
    expect(check(wrapped("B"), wrapped("A"))).toBe(false);
  });
});
