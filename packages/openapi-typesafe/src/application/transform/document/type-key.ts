import { assertNever } from "../../../domain/assert-never.js";
import type { IrMember, IrPropertyName, IrTupleElement, IrType } from "../../../domain/ir/nodes.js";

/**
 * A text that is the same for two types exactly when they are written the same, comments left
 * out: the overlap check accepts a type it does not model when it is the same as the other.
 */

function nameKey(name: IrPropertyName): string {
  return JSON.stringify(name.kind === "string" ? name.value : name.text);
}

function memberKey(member: IrMember, typeKeyOf: TypeKey): string {
  if (member.kind === "indexSignature") {
    const readonly = member.isReadonly ? "readonly " : "";
    return `${readonly}[${typeKeyOf(member.parameterType)}]:${typeKeyOf(member.type)}`;
  }
  const readonly = member.isReadonly ? "readonly " : "";
  const optional = member.isOptional ? "?" : "";
  return `${readonly}${nameKey(member.name)}${optional}:${typeKeyOf(member.type)}`;
}

function listKey(types: readonly IrType[], typeKeyOf: TypeKey): string {
  return types.map(typeKeyOf).join(",");
}

function elementKey(element: IrTupleElement, typeKeyOf: TypeKey): string {
  const prefix = element.isRest ? "..." : "";
  return `${prefix}${typeKeyOf(element.type)}${element.isOptional ? "?" : ""}`;
}

function computeKey(type: IrType, typeKeyOf: TypeKey): string {
  switch (type.kind) {
    case "keyword":
      return type.keyword;
    case "stringLiteral":
      return JSON.stringify(type.value);
    case "numberLiteral":
    case "booleanLiteral":
      return String(type.value);
    case "reference":
      return `${type.name}<${listKey(type.typeArguments, typeKeyOf)}>`;
    case "array":
      return `(${typeKeyOf(type.element)})[]`;
    case "tuple":
      return `[${type.elements.map((element) => elementKey(element, typeKeyOf)).join(",")}]`;
    case "union":
      return `union(${listKey(type.types, typeKeyOf)})`;
    case "intersection":
      return `intersection(${listKey(type.types, typeKeyOf)})`;
    case "object":
      return `{${type.members.map((member) => memberKey(member, typeKeyOf)).join(";")}}`;
    case "indexedAccess":
      return `${typeKeyOf(type.object)}[${typeKeyOf(type.index)}]`;
    case "readonly":
      return `readonly(${typeKeyOf(type.type)})`;
    case "raw":
      return `raw(${type.text})`;
    default:
      return assertNever(type);
  }
}

/** The key of a type. */
export type TypeKey = (type: IrType) => string;

/** A key function that computes each node's key once; one per comparison, not shared. */
export function createTypeKey(): TypeKey {
  const keys = new WeakMap<IrType, string>();
  const typeKeyOf: TypeKey = (type) => {
    const known = keys.get(type);
    if (known !== undefined) {
      return known;
    }
    const key = computeKey(type, typeKeyOf);
    keys.set(type, key);
    return key;
  };
  return typeKeyOf;
}
