import type {
  IrIndexSignature,
  IrMember,
  IrObjectType,
  IrPropertySignature,
  IrType,
} from "../../../domain/ir/nodes.js";
import type { DeclaredTypeLookup } from "./declared-types.js";

/**
 * The types the `--path-params-as-types` overlap check compares, as TypeScript sees them:
 * references followed to the declarations of the document, `T["key"]` read from `T`, and an
 * intersection of object types merged into one object.
 */

const UNDEFINED: IrType = { kind: "keyword", keyword: "undefined" };

export function nameOf(member: IrPropertySignature): string {
  return member.name.kind === "string" ? member.name.value : member.name.text;
}

export function propertiesOf(type: IrObjectType): Map<string, IrPropertySignature> {
  const properties = type.members.filter(
    (member: IrMember): member is IrPropertySignature => member.kind === "property",
  );
  return new Map(properties.map((property) => [nameOf(property), property]));
}

export function indexSignaturesOf(type: IrObjectType): IrIndexSignature[] {
  return type.members.filter(
    (member: IrMember): member is IrIndexSignature => member.kind === "indexSignature",
  );
}

/** The type read from a property: an optional one may be `undefined`. */
export function readType(property: IrPropertySignature): IrType {
  return property.isOptional ? { kind: "union", types: [property.type, UNDEFINED] } : property.type;
}

/** One property for two of the same name in an intersection. */
function mergedProperty(
  first: IrPropertySignature,
  second: IrPropertySignature,
): IrPropertySignature {
  return {
    ...first,
    type: { kind: "intersection", types: [first.type, second.type] },
    isOptional: first.isOptional && second.isOptional,
    isReadonly: first.isReadonly || second.isReadonly,
  };
}

/** Resolves types once each, for one comparison. */
export class TypeResolution {
  private readonly lookup: DeclaredTypeLookup;
  private readonly resolvedTypes = new Map<IrType, IrType>();

  constructor(lookup: DeclaredTypeLookup) {
    this.lookup = lookup;
  }

  /** The type a reference names, followed through references to references; computed once. */
  resolved(type: IrType): IrType {
    const known = this.resolvedTypes.get(type);
    if (known !== undefined) {
      return known;
    }
    // A type that reaches itself while it is resolved stays as it is written there.
    this.resolvedTypes.set(type, type);
    const seen = new Set<IrType>();
    let current = type;
    while (!seen.has(current)) {
      seen.add(current);
      const named = this.lookup(current) ?? this.indexedProperty(current);
      if (named === null) {
        break;
      }
      current = named;
    }
    const result = current.kind === "intersection" ? (this.merged(current) ?? current) : current;
    this.resolvedTypes.set(type, result);
    return result;
  }

  /**
   * `T["key"]` read from the object type `T` resolves to, which the lookup does not do for an
   * object it reached through another lookup (`paths["/a/{id}"]["get"]`). An optional property
   * reads as `T | undefined`.
   */
  private indexedProperty(type: IrType): IrType | null {
    if (type.kind !== "indexedAccess" || type.index.kind !== "stringLiteral") {
      return null;
    }
    const object = this.resolved(type.object);
    if (object.kind !== "object") {
      return null;
    }
    const property = propertiesOf(object).get(type.index.value);
    return property === undefined ? null : readType(property);
  }

  /**
   * An intersection of object types as the one object TypeScript makes of it: a property in
   * several parts has the intersection of their types, and is optional only when it is in each.
   * Null when a part is no object type.
   */
  private merged(type: IrType): IrObjectType | null {
    const parts = this.objectParts(type);
    if (parts === null) {
      return null;
    }
    const properties = new Map<string, IrPropertySignature>();
    const indexes: IrIndexSignature[] = [];
    for (const member of parts.flatMap((part) => part.members)) {
      if (member.kind === "indexSignature") {
        indexes.push(member);
        continue;
      }
      const name = nameOf(member);
      const other = properties.get(name);
      properties.set(name, other === undefined ? member : mergedProperty(other, member));
    }
    return { kind: "object", members: [...properties.values(), ...indexes] };
  }

  /**
   * The object types an intersection is made of, nested ones flattened; null for any other, and
   * for an intersection that contains itself, which TypeScript does not merge either.
   */
  private objectParts(
    type: IrType,
    visiting: ReadonlySet<IrType> = new Set(),
  ): IrObjectType[] | null {
    if (type.kind === "object") {
      return [type];
    }
    if (type.kind !== "intersection" || visiting.has(type)) {
      return null;
    }
    const parts: IrObjectType[] = [];
    for (const part of type.types) {
      const objects = this.objectParts(this.resolved(part), new Set([...visiting, type]));
      if (objects === null) {
        return null;
      }
      parts.push(...objects);
    }
    return parts;
  }
}
