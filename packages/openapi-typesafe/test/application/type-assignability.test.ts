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
    expect(isAssignable(STRING, UNKNOWN)).toBe("assignable");
    expect(isAssignable(NEVER, NUMBER)).toBe("assignable");
  });

  it("assignabilityProof accepts literals for their keyword and rejects other keywords", () => {
    expect(isAssignable(literal("a"), STRING)).toBe("assignable");
    expect(isAssignable(irNumber(1), NUMBER)).toBe("assignable");
    expect(isAssignable(irBoolean(true), irKeyword("boolean"))).toBe("assignable");
    expect(isAssignable(literal("a"), NUMBER)).toBe("rejected");
    expect(isAssignable(STRING, NUMBER)).toBe("rejected");
  });

  it("assignabilityProof accepts a union whose every member fits", () => {
    const target = irUnion([literal("a"), literal("b"), literal("c")]);

    expect(isAssignable(irUnion([literal("a"), literal("b")]), target)).toBe("assignable");
    expect(isAssignable(irUnion([literal("a"), literal("d")]), target)).toBe("rejected");
  });

  it("assignabilityProof compares arrays of literal unions by their items", () => {
    const names = irArray(irUnion([literal("id"), literal("name")]));

    expect(isAssignable(irArray(irUnion([literal("id"), literal("contentType")])), names)).toBe(
      "rejected",
    );
    expect(isAssignable(irArray(literal("id")), names)).toBe("assignable");
  });

  it("assignabilityProof leaves a type it does not model undecided unless it is the same", () => {
    const record = irReference("Record", [STRING, NEVER]);

    expect(isAssignable(record, irReference("Record", [STRING, NEVER]))).toBe("assignable");
    expect(isAssignable(record, irReference("Record", [STRING, UNKNOWN]))).toBe("undecided");
    expect(isAssignable(irRaw("A"), irRaw("A"))).toBe("assignable");
    expect(isAssignable(irRaw("A"), irRaw("B"))).toBe("undecided");
    expect(isAssignable(record, object(irStringIndexSignature("key", UNKNOWN)))).toBe("undecided");
  });
});

describe("assignabilityProof: arrays, tuples and readonly", () => {
  it("assignabilityProof compares a tuple with an array by every element", () => {
    const tuple = irTuple([
      irTupleElement(literal("a")),
      irTupleElement(irArray(literal("b")), true),
    ]);

    expect(isAssignable(tuple, irArray(STRING))).toBe("assignable");
    expect(isAssignable(tuple, irArray(NUMBER))).toBe("rejected");
    expect(isAssignable(irArray(STRING), irTuple([irTupleElement(STRING)]))).toBe("rejected");
    expect(isAssignable(literal("a"), irArray(STRING))).toBe("rejected");
  });

  it("assignabilityProof reads an optional tuple element as possibly undefined", () => {
    // `[string?, ...string[]]` is no `string[]` under `strict`: the first item may be undefined.
    const prefixed = irTuple([
      irOptionalTupleElement(STRING),
      irTupleElement(irArray(STRING), true),
    ]);

    expect(isAssignable(prefixed, irArray(STRING))).toBe("rejected");
    expect(isAssignable(prefixed, irArray(irUnion([STRING, UNDEFINED])))).toBe("assignable");
  });

  it("assignabilityProof compares tuples element by element, with the same shape", () => {
    const pair = irTuple([irTupleElement(literal("a")), irTupleElement(NUMBER)]);

    expect(isAssignable(pair, irTuple([irTupleElement(STRING), irTupleElement(NUMBER)]))).toBe(
      "assignable",
    );
    expect(
      isAssignable(pair, irTuple([irTupleElement(STRING), irOptionalTupleElement(NUMBER)])),
    ).toBe("assignable");
    expect(isAssignable(pair, irTuple([irTupleElement(STRING)]))).toBe("rejected");
    expect(
      isAssignable(irTuple([irOptionalTupleElement(STRING)]), irTuple([irTupleElement(STRING)])),
    ).toBe("rejected");
  });

  it("assignabilityProof leaves tuples with a rest element in other places undecided", () => {
    // `[string, ...string[]]` fits `[string, string?]` only when it has at most two items.
    const open = irTuple([irTupleElement(STRING), irTupleElement(irArray(STRING), true)]);
    const pair = irTuple([irTupleElement(STRING), irOptionalTupleElement(STRING)]);

    expect(isAssignable(open, pair)).toBe("undecided");
    expect(isAssignable(pair, open)).toBe("undecided");
  });

  it("assignabilityProof accepts a mutable array for a readonly one, not the other way", () => {
    expect(isAssignable(irArray(STRING), irReadonly(irArray(STRING)))).toBe("assignable");
    expect(isAssignable(irReadonly(irArray(literal("a"))), irReadonly(irArray(STRING)))).toBe(
      "assignable",
    );
    expect(isAssignable(irReadonly(irArray(STRING)), irArray(STRING))).toBe("rejected");
  });
});

describe("assignabilityProof: objects", () => {
  it("assignabilityProof needs every required property, with a fitting type", () => {
    const target = object(required("id"), optional("note"));

    expect(isAssignable(object(required("id", literal("a")), required("extra")), target)).toBe(
      "assignable",
    );
    expect(isAssignable(object(optional("id")), target)).toBe("rejected");
    expect(isAssignable(object(required("note")), target)).toBe("rejected");
    expect(isAssignable(object(required("id", NUMBER)), target)).toBe("rejected");
  });

  it("assignabilityProof fills an empty slot only with undefined or nothing", () => {
    const target = object(optional("post", NEVER));

    expect(isAssignable(object(optional("post", NEVER)), target)).toBe("assignable");
    expect(isAssignable(object(required("post", object())), target)).toBe("rejected");
    expect(isAssignable(object(), target)).toBe("assignable");
    expect(isAssignable(object(optional("post", UNDEFINED)), target)).toBe("assignable");
    // Raw text (a callback's type) may be `undefined`, and a reference may name `never`.
    expect(isAssignable(object(required("post", irRaw("any"))), target)).toBe("undecided");
    expect(isAssignable(object(required("post", schema("Missing"))), target)).toBe("undecided");
  });

  it("assignabilityProof needs a method the covering path item has", () => {
    const covering = object(required("get", object()), optional("post", NEVER));

    expect(isAssignable(object(optional("get", NEVER)), covering)).toBe("rejected");
    expect(isAssignable(object(optional("get", object())), covering)).toBe("rejected");
    expect(isAssignable(object(required("get", object()), required("sub")), covering)).toBe(
      "assignable",
    );
  });

  it("assignabilityProof rejects a source that shares no property with a weak type", () => {
    const weak = object(optional("a"), optional("b"));

    expect(isAssignable(object(required("c")), weak)).toBe("rejected");
    expect(isAssignable(object(required("a"), required("c")), weak)).toBe("assignable");
    expect(isAssignable(object(), weak)).toBe("assignable");
  });

  it("assignabilityProof checks every property and index against a string index", () => {
    const headers = object(irStringIndexSignature("name", UNKNOWN));
    const strings = object(irStringIndexSignature("name", STRING));

    expect(
      isAssignable(object(required("a", NUMBER), irStringIndexSignature("n", NUMBER)), headers),
    ).toBe("assignable");
    expect(isAssignable(object(required("a", NUMBER)), strings)).toBe("rejected");
    expect(isAssignable(object(irStringIndexSignature("n", NUMBER)), strings)).toBe("rejected");
  });

  it("assignabilityProof leaves a target index that is not a string index undecided", () => {
    const template: IrIndexSignature = {
      ...irStringIndexSignature("path", STRING),
      parameterType: irRaw(`\`/a/\${string}\``),
    };

    expect(isAssignable(object(), object(template))).toBe("undecided");
    // A template index of the source applies to a string index of the target.
    const strings = object(irStringIndexSignature("n", STRING));
    expect(isAssignable(object(template), strings)).toBe("assignable");
    expect(isAssignable(object({ ...template, type: NUMBER }), strings)).toBe("rejected");
  });

  it("assignabilityProof does not check a missing optional property against a string index", () => {
    const target = object(optional("a"));

    expect(isAssignable(object(irStringIndexSignature("n", literal("x"))), target)).toBe(
      "assignable",
    );
    expect(isAssignable(object(irStringIndexSignature("n", NUMBER)), target)).toBe("assignable");
  });

  it("assignabilityProof accepts an optional value for an optional property, undefined included", () => {
    expect(
      isAssignable(object(optional("a")), object(optional("a", irUnion([STRING, UNDEFINED])))),
    ).toBe("assignable");
    expect(
      isAssignable(object(optional("a")), object(required("a", irUnion([STRING, UNDEFINED])))),
    ).toBe("rejected");
  });
});

describe("assignabilityProof: intersections and references", () => {
  it("assignabilityProof merges an intersection of objects, a shared property into both types", () => {
    const merged = irIntersection([
      object(optional("a", literal("x"))),
      object(required("a"), required("b")),
    ]);

    expect(isAssignable(merged, object(required("a", literal("x")), required("b")))).toBe(
      "assignable",
    );
    expect(isAssignable(object(required("a", literal("x")), required("b")), merged)).toBe(
      "assignable",
    );
    expect(isAssignable(object(required("a", literal("y")), required("b")), merged)).toBe(
      "rejected",
    );
  });

  it("assignabilityProof accepts an intersection with a non-object part when one part fits", () => {
    const parts = irIntersection([object(required("a")), irRaw("Brand")]);

    expect(isAssignable(parts, object(required("a")))).toBe("assignable");
    expect(isAssignable(parts, object(required("b")))).toBe("undecided");
    expect(isAssignable(object(required("a")), parts)).toBe("undecided");
    expect(isAssignable(object(required("a", NUMBER)), parts)).toBe("rejected");
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

    expect(check(schema("Tagged"), schema("Item"))).toBe("assignable");
    expect(check(schema("List"), schema("Item"))).toBe("rejected");
    expect(check(schema("Item"), schema("List"))).toBe("rejected");
    expect(check(tag, irUnion([STRING, UNDEFINED]))).toBe("assignable");
    expect(check(tag, STRING)).toBe("rejected");
    expect(check(irIndexedAccess(schema("Tagged"), irString("missing", "escaped")), STRING)).toBe(
      "undecided",
    );
    expect(check(irIndexedAccess(schema("List"), irString("id", "escaped")), STRING)).toBe(
      "undecided",
    );
  });

  it("assignabilityProof terminates on recursive types and relates them structurally", () => {
    const check = proof([
      schemas({
        Tree: object(optional("child", schema("Tree")), required("name")),
        Node: object(optional("child", schema("Node")), required("name", literal("n"))),
        Self: irIntersection([object(required("name")), schema("Self")]),
      }),
    ]);

    expect(check(schema("Node"), schema("Tree"))).toBe("assignable");
    expect(check(schema("Tree"), schema("Node"))).toBe("rejected");
    expect(check(schema("Self"), object(required("name")))).toBe("assignable");
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

    expect(check(schema("A"), schema("B"))).toBe("rejected");
    expect(check(wrapped("B"), wrapped("A"))).toBe("rejected");
  });
});

describe("assignabilityProof: rejected only where TypeScript surely rejects", () => {
  it("assignabilityProof rejects a pair of different categories, except for an object target", () => {
    expect(isAssignable(object(required("a")), STRING)).toBe("rejected");
    expect(isAssignable(object(required("a")), irArray(STRING))).toBe("rejected");
    expect(isAssignable(object(required("length", NUMBER)), irArray(STRING))).toBe("undecided");
    expect(isAssignable(irArray(STRING), NUMBER)).toBe("rejected");
    expect(isAssignable(STRING, object(required("length", NUMBER)))).toBe("undecided");
    expect(isAssignable(irKeyword("null"), object())).toBe("rejected");
    expect(isAssignable(UNKNOWN, object())).toBe("rejected");
    expect(isAssignable(STRING, NEVER)).toBe("rejected");
  });

  it("assignabilityProof rejects a list for an object that needs a property no list has", () => {
    expect(isAssignable(irArray(STRING), object(required("data")))).toBe("rejected");
    expect(isAssignable(irArray(STRING), object(optional("code")))).toBe("rejected");
    expect(isAssignable(irArray(STRING), object(required("length", NUMBER)))).toBe("undecided");
    expect(isAssignable(irArray(STRING), object(optional("map"), optional("code")))).toBe(
      "undecided",
    );
    expect(isAssignable(irTuple([irTupleElement(STRING)]), object(required("0")))).toBe(
      "undecided",
    );
  });

  it("assignabilityProof leaves an object undecided for a union of objects it may discriminate", () => {
    const kinds = irUnion([
      object(required("k", literal("a"))),
      object(required("k", literal("b"))),
    ]);
    const either = object(required("k", irUnion([literal("a"), literal("b")])));

    expect(isAssignable(either, kinds)).toBe("undecided");
    expect(isAssignable(object(required("k", literal("a"))), kinds)).toBe("assignable");
    expect(isAssignable(irKeyword("null"), kinds)).toBe("rejected");
  });

  it("assignabilityProof leaves a weak type part of an intersection it cannot merge undecided", () => {
    const parts = irIntersection([object(optional("a")), irRaw("Brand")]);

    expect(isAssignable(object(required("b")), parts)).toBe("undecided");
  });

  it("assignabilityProof rejects tuples of other fixed lengths and arrays for required items", () => {
    const one = irTuple([irTupleElement(STRING)]);
    const pair = irTuple([irTupleElement(STRING), irTupleElement(STRING)]);
    const openPair = irTuple([irTupleElement(STRING), irOptionalTupleElement(STRING)]);

    expect(isAssignable(pair, one)).toBe("rejected");
    expect(isAssignable(openPair, one)).toBe("undecided");
    expect(isAssignable(irArray(STRING), one)).toBe("rejected");
    expect(isAssignable(irArray(STRING), irTuple([irOptionalTupleElement(STRING)]))).toBe(
      "undecided",
    );
  });

  it("assignabilityProof rejects a readonly array for a mutable list", () => {
    const tuple = irTuple([irTupleElement(STRING)]);

    expect(isAssignable(irReadonly(irArray(STRING)), tuple)).toBe("rejected");
  });

  it("assignabilityProof compares an optional source property by its type for a string index", () => {
    const strings = object(irStringIndexSignature("n", STRING));

    expect(isAssignable(object(optional("a")), strings)).toBe("assignable");
    expect(isAssignable(object(required("a", irRaw("A"))), strings)).toBe("undecided");
  });

  it("assignabilityProof rejects a keyword for a literal and a literal of another value", () => {
    expect(isAssignable(irKeyword("boolean"), irBoolean(true))).toBe("rejected");
    expect(isAssignable(literal("a"), literal("b"))).toBe("rejected");
    expect(isAssignable(irNumber(1), irKeyword("null"))).toBe("rejected");
  });
});
