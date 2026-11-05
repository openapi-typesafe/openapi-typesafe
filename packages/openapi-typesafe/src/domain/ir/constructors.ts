import type {
  IrArrayType,
  IrBooleanLiteralType,
  IrComment,
  IrIndexedAccessType,
  IrIndexSignature,
  IrIntersectionType,
  IrKeyword,
  IrKeywordType,
  IrMember,
  IrNumberLiteralType,
  IrObjectType,
  IrPropertyName,
  IrPropertySignature,
  IrRawType,
  IrReadonlyType,
  IrReferenceType,
  IrStringEncoding,
  IrStringLiteralType,
  IrTupleElement,
  IrTupleType,
  IrType,
  IrUnionType,
} from "./nodes.js";

/**
 * Constructors of IR nodes. They build exactly the node asked for: no flattening, de-duplication or
 * sorting happens here (ENGINEERING_PLAN §4.2). Callers that need those call the functions in
 * `normalize.ts` explicitly, at the same places the original generator does.
 */

export function irKeyword(keyword: IrKeyword): IrKeywordType {
  return { kind: "keyword", keyword };
}

export function irString(value: string, encoding: IrStringEncoding): IrStringLiteralType {
  return { kind: "stringLiteral", value, encoding };
}

/** Throws on NaN and infinities: they have no literal type. */
export function irNumber(value: number): IrNumberLiteralType {
  if (!Number.isFinite(value)) {
    throw new RangeError(`A number literal type needs a finite number, got ${value}`);
  }
  return { kind: "numberLiteral", value };
}

export function irBoolean(value: boolean): IrBooleanLiteralType {
  return { kind: "booleanLiteral", value };
}

export function irReference(name: string, typeArguments: readonly IrType[] = []): IrReferenceType {
  return { kind: "reference", name, typeArguments };
}

export function irArray(element: IrType): IrArrayType {
  return { kind: "array", element };
}

export function irTuple(elements: readonly IrTupleElement[]): IrTupleType {
  return { kind: "tuple", elements };
}

export function irTupleElement(type: IrType, isRest = false): IrTupleElement {
  return { type, isRest, isOptional: false };
}

/** `T?`: an element the tuple may end before. */
export function irOptionalTupleElement(type: IrType): IrTupleElement {
  return { type, isRest: false, isOptional: true };
}

export function irUnion(types: readonly IrType[]): IrUnionType {
  return { kind: "union", types };
}

export function irIntersection(types: readonly IrType[]): IrIntersectionType {
  return { kind: "intersection", types };
}

export function irObject(members: readonly IrMember[]): IrObjectType {
  return { kind: "object", members };
}

export function irIndexedAccess(object: IrType, index: IrType): IrIndexedAccessType {
  return { kind: "indexedAccess", object, index };
}

export function irReadonly(type: IrType): IrReadonlyType {
  return { kind: "readonly", type };
}

/**
 * Type text printed as is. The original builds some types from text (template literal path keys,
 * root type aliases); keeping them as text keeps their exact spelling.
 */
export function irRaw(text: string, origin?: unknown): IrRawType {
  return origin === undefined ? { kind: "raw", text } : { kind: "raw", text, origin };
}

/** Options of a property signature; omitted flags are false and there are no comments. */
export interface IrPropertyOptions {
  readonly isOptional?: boolean;
  readonly isReadonly?: boolean;
  readonly comments?: readonly IrComment[];
}

export function irProperty(
  name: IrPropertyName,
  type: IrType,
  options: IrPropertyOptions = {},
): IrPropertySignature {
  return {
    kind: "property",
    name,
    type,
    isOptional: options.isOptional ?? false,
    isReadonly: options.isReadonly ?? false,
    comments: options.comments ?? [],
  };
}

/** `[name: string]: type` (a `string` key, the only kind the generator writes). */
export function irStringIndexSignature(
  parameterName: string,
  type: IrType,
  isReadonly = false,
): IrIndexSignature {
  return {
    kind: "indexSignature",
    parameterName,
    parameterType: irKeyword("string"),
    type,
    isReadonly,
    comments: [],
  };
}

/** `Record<key, value>`. */
export function irRecord(key: IrType, value: IrType): IrReferenceType {
  return irReference("Record", [key, value]);
}
