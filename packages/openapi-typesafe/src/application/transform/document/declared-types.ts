import type { IrDeclaration, IrMember, IrType } from "../../../domain/ir/nodes.js";

/**
 * The type a reference of the generated file names, read from the file's declarations: the
 * `--path-params-as-types` overlap check compares two path items through the operations and
 * components they reference (upstream #1752).
 */

/** The declared type a reference names, or null when the type is no such reference. */
export type DeclaredTypeLookup = (type: IrType) => IrType | null;

/** Knows no declaration: every reference stays unresolved. */
export const NO_DECLARED_TYPES: DeclaredTypeLookup = () => null;

/** A reference without type arguments and the string keys indexing it: `components["schemas"]`. */
interface IndexedName {
  readonly name: string;
  readonly keys: readonly string[];
}

function indexedNameOf(type: IrType): IndexedName | null {
  if (type.kind === "reference") {
    return type.typeArguments.length === 0 ? { name: type.name, keys: [] } : null;
  }
  if (type.kind !== "indexedAccess" || type.index.kind !== "stringLiteral") {
    return null;
  }
  const object = indexedNameOf(type.object);
  return object === null ? null : { ...object, keys: [...object.keys, type.index.value] };
}

function memberName(member: IrMember): string | null {
  if (member.kind !== "property") {
    return null;
  }
  return member.name.kind === "string" ? member.name.value : member.name.text;
}

/**
 * The type of the required property `key`. An optional one is `T | undefined` when indexed, which
 * is not the declared type, so it is not followed.
 */
function propertyType(type: IrType, key: string): IrType | null {
  if (type.kind !== "object") {
    return null;
  }
  const member = type.members.find((candidate) => memberName(candidate) === key);
  return member?.kind === "property" && !member.isOptional ? member.type : null;
}

function declarationType(declaration: IrDeclaration): IrType | null {
  switch (declaration.kind) {
    case "interface":
      return { kind: "object", members: declaration.members };
    case "typeAlias":
      return declaration.type;
    case "enum":
    case "constArray":
    case "rawDeclaration":
      return null;
  }
}

/**
 * A lookup over the declarations. Only a name declared once is read: a second declaration of an
 * interface merges with the first, which this lookup does not model.
 */
export function declaredTypeLookup(declarations: readonly IrDeclaration[]): DeclaredTypeLookup {
  const byName = new Map<string, IrType | null>();
  for (const declaration of declarations) {
    if ("name" in declaration && declaration.name !== undefined) {
      const isRepeated = byName.has(declaration.name);
      byName.set(declaration.name, isRepeated ? null : declarationType(declaration));
    }
  }
  // References being resolved: a reference that indexes into itself names no type.
  const resolving = new Set<IrType>();
  const lookup: DeclaredTypeLookup = (type) => {
    const indexed = indexedNameOf(type);
    if (indexed === null || indexed.keys.length === 0 || resolving.has(type)) {
      return null;
    }
    resolving.add(type);
    // A key may index a property whose type is a reference again (`paths["/a"]["get"]`).
    const declared = indexed.keys.reduce<IrType | null>((object, key) => {
      const named = object === null || object.kind === "object" ? object : lookup(object);
      return named === null ? null : propertyType(named, key);
    }, byName.get(indexed.name) ?? null);
    resolving.delete(type);
    return declared;
  };
  return lookup;
}
