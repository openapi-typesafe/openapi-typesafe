import type { IrDeclaration, IrMember, IrType } from "../../../domain/ir/nodes.js";
import {
  absorbed,
  type Evaluated,
  type Evaluation,
  MISSING,
  NEVER,
  OPAQUE,
  propertyKey,
  unionType,
} from "./evaluation.js";
import {
  declaredFirst,
  extracted,
  isNeverIntersection,
  markerObject,
  omitted,
} from "./type-rules.js";

/**
 * A small evaluator of the generated types, as TypeScript reads them, for the `--enum-values`
 * check (ADR-027). It follows the declarations of the document and the helper types the generator
 * writes (`NonNullable`, `Extract`, `WithRequired`, `Omit`, `Record`, `FlattenedDeepRequired`). Its
 * answers are sure: a key is `missing` only where TypeScript reports it, and every type it does
 * not model is `opaque`, which never counts as an error.
 */

/** How many references one evaluation expands; a deeper one is opaque. */
const MAX_EXPANSIONS = 200;
const DEEP_PREFIX = "FlattenedDeepRequired<";
/** How many members distributing an intersection may give; more is opaque. */
const MAX_DISTRIBUTED = 64;
const NULLISH: ReadonlySet<string> = new Set(["null", "undefined"]);

export class TypeEvaluator {
  private readonly declared = new Map<string, IrType>();
  private expansions = 0;

  constructor(declarations: readonly IrDeclaration[]) {
    for (const declaration of declarations) {
      if (declaration.kind === "interface") {
        this.declared.set(declaration.name, { kind: "object", members: declaration.members });
      } else if (declaration.kind === "typeAlias") {
        this.declared.set(declaration.name, declaration.type);
      }
    }
  }

  /** Evaluate a type written in the footer; the expansion budget starts again. */
  evaluate(type: IrType): Evaluation {
    this.expansions = 0;
    return this.expand({ kind: "type", type, deep: false });
  }

  /** The type with references, `readonly` and indexed access resolved at the top. */
  expand(value: Evaluated): Evaluation {
    const { type } = value;
    switch (type.kind) {
      case "readonly":
        return this.expand({ ...value, type: type.type });
      case "indexedAccess":
        return this.indexedAccess(value, type.object, type.index);
      case "reference":
        return this.reference(value, type.name, type.typeArguments);
      case "raw":
      case "tuple":
        return OPAQUE;
      default:
        return value;
    }
  }

  private indexedAccess(value: Evaluated, object: IrType, index: IrType): Evaluation {
    const owner = this.expand({ ...value, type: object });
    return owner.kind === "type" ? this.index(owner, index) : owner;
  }

  private reference(value: Evaluated, name: string, args: readonly IrType[]): Evaluation {
    // Only references cost budget: re-expanding an already expanded value (as the checks after
    // `evaluate` do) is free, so a large evaluation does not leave its checks opaque.
    if (this.expansions++ > MAX_EXPANSIONS) {
      return OPAQUE;
    }
    if (name.startsWith(DEEP_PREFIX) && name.endsWith(">")) {
      const root = this.declared.get(name.slice(DEEP_PREFIX.length, -1));
      return root === undefined ? OPAQUE : this.expand({ kind: "type", type: root, deep: true });
    }
    const declared = args.length === 0 ? this.declared.get(name) : undefined;
    if (declared !== undefined) {
      return this.expand({ ...value, type: declared });
    }
    const [first, second] = args;
    if (first === undefined) {
      return OPAQUE;
    }
    const argument = this.expand({ ...value, type: first });
    if (argument.kind !== "type") {
      return argument;
    }
    return this.helper(name, argument, second);
  }

  private helper(name: string, argument: Evaluated, second: IrType | undefined): Evaluation {
    switch (name) {
      case "NonNullable":
        return this.withoutNullish(argument);
      case "WithRequired":
      case "Readonly":
        return argument;
      case "Extract":
        return second === undefined ? OPAQUE : this.extract(argument, second);
      case "Omit":
        return second === undefined ? OPAQUE : omitted(this, argument, second);
      default:
        return markerObject(name, argument) ?? OPAQUE;
    }
  }

  /**
   * The members of a union, each expanded; an intersection with unions in it is distributed over
   * them (`A & (B | C)` is `(A & B) | (A & C)`), as TypeScript normalizes it. A type that is not a
   * union is its only member. A union with an `any` or `unknown` member is that keyword alone.
   */
  membersOf(value: Evaluated): readonly Evaluation[] {
    const expanded = this.expand(value);
    if (expanded.kind !== "type") {
      return [expanded];
    }
    const { type } = expanded;
    if (type.kind === "union") {
      return absorbed(
        type.types.flatMap((member) => this.membersOf({ ...expanded, type: member })),
      );
    }
    return type.kind === "intersection" ? this.distributed(expanded, type.types) : [expanded];
  }

  private distributed(value: Evaluated, parts: readonly IrType[]): readonly Evaluation[] {
    const memberLists = parts.map((part) => this.membersOf({ ...value, type: part }));
    const size = memberLists.reduce((product, list) => product * list.length, 1);
    if (size > MAX_DISTRIBUTED || memberLists.some((list) => list.some((m) => m.kind !== "type"))) {
      return [OPAQUE];
    }
    let combinations: IrType[][] = [[]];
    for (const list of memberLists as Evaluated[][]) {
      combinations = combinations.flatMap((done) => list.map((member) => [...done, member.type]));
    }
    return combinations.map((types) => ({ ...value, type: intersectionType(types) }));
  }

  private withoutNullish(value: Evaluated): Evaluation {
    const members = this.membersOf(value);
    if (members.some((member) => member.kind !== "type")) {
      return OPAQUE;
    }
    const kept = (members as Evaluated[]).filter((member) => !isNullish(member.type));
    return { ...value, type: unionType(kept.map((member) => member.type)) };
  }

  /** `Extract<T, { key: unknown }>` keeps the members that have `key`; other probes are opaque. */
  private extract(value: Evaluated, probe: IrType): Evaluation {
    const [member] = probe.kind === "object" ? probe.members : [];
    if (probe.kind !== "object" || probe.members.length !== 1 || member?.kind !== "property") {
      return OPAQUE;
    }
    return extracted(this, value, propertyKey(member.name));
  }

  /** `value[index]` for a string literal, `string` or `number` index. */
  index(value: Evaluated, index: IrType): Evaluation {
    const owner = this.expand(value);
    if (owner.kind !== "type") {
      return owner;
    }
    if (this.membersOf(owner).length > 1) {
      return this.unionIndex(owner, index);
    }
    const { type } = owner;
    switch (type.kind) {
      case "object":
        return this.memberType(owner, type.members, index);
      case "intersection":
        return this.partsIndex(owner, type.types, index);
      case "union":
        return this.unionIndex(owner, index);
      case "array":
        return isNumberIndex(index) ? this.flattened(owner, type.element) : builtInIndex(index);
      case "keyword":
        return type.keyword === "never" ? owner : builtInIndex(index);
      default:
        return builtInIndex(index);
    }
  }

  private memberType(owner: Evaluated, members: readonly IrMember[], index: IrType): Evaluation {
    const key = indexKey(index);
    const property = members.find(
      (member) => member.kind === "property" && key !== null && propertyKey(member.name) === key,
    );
    if (property !== undefined) {
      return this.flattened(owner, property.type);
    }
    const signature = members.find((member) => member.kind === "indexSignature");
    if (signature !== undefined) {
      return this.flattened(owner, signature.type);
    }
    return key === null || isObjectBuiltIn(key) ? OPAQUE : MISSING;
  }

  private partsIndex(owner: Evaluated, parts: readonly IrType[], index: IrType): Evaluation {
    if (isNeverIntersection(this, owner, parts)) {
      return { ...owner, type: NEVER };
    }
    const found = parts.map((type) => this.index({ ...owner, type }, index));
    if (found.some((part) => part.kind === "opaque")) {
      return OPAQUE;
    }
    const read = parts.map((type, at) => ({ type, found: found[at] as Evaluation }));
    const types = declaredFirst(this, owner, indexKey(index), read).flatMap((part) =>
      part.kind === "type" ? [part.type] : [],
    );
    return types.length === 0 ? MISSING : { ...owner, type: intersectionType(types) };
  }

  private unionIndex(owner: Evaluated, index: IrType): Evaluation {
    const found = this.membersOf(owner).map((member) =>
      member.kind === "type" ? this.index(member, index) : member,
    );
    if (found.some((member) => member.kind === "missing")) {
      return MISSING;
    }
    if (found.some((member) => member.kind === "opaque")) {
      return OPAQUE;
    }
    return { ...owner, type: unionType((found as Evaluated[]).map((member) => member.type)) };
  }

  /**
   * A member read through `FlattenedDeepRequired`: a value that is only arrays (and `undefined` or
   * `null`) is replaced by its elements, anything else loses `undefined` and `null`.
   */
  private flattened(owner: Evaluated, type: IrType): Evaluation {
    const member: Evaluated = { ...owner, type };
    if (!owner.deep) {
      return this.expand(member);
    }
    const members = this.membersOf(member);
    if (members.some((candidate) => candidate.kind !== "type")) {
      return OPAQUE;
    }
    const present = (members as Evaluated[]).filter((candidate) => !isNullish(candidate.type));
    const elements = present.map((candidate) => arrayElement(candidate.type));
    if (present.length > 0 && elements.every((element) => element !== null)) {
      return this.expand({ ...owner, type: unionType(elements as IrType[]) });
    }
    return { ...owner, type: unionType(present.map((candidate) => candidate.type)) };
  }
}

function isNullish(type: IrType): boolean {
  return type.kind === "keyword" && NULLISH.has(type.keyword);
}

/** The element of an expanded member; expanding already dropped `readonly`. */
function arrayElement(type: IrType): IrType | null {
  return type.kind === "array" ? type.element : null;
}

function intersectionType(types: readonly IrType[]): IrType {
  return types.length === 1 ? (types[0] as IrType) : { kind: "intersection", types };
}

function indexKey(index: IrType): string | null {
  if (index.kind === "stringLiteral") {
    return index.value;
  }
  return index.kind === "numberLiteral" ? String(index.value) : null;
}

function isNumberIndex(index: IrType): boolean {
  const key = indexKey(index);
  return (index.kind === "keyword" && index.keyword === "number") || /^\d+$/.test(key ?? "");
}

function isObjectBuiltIn(key: string): boolean {
  return key in {};
}

/** A key of a primitive or an array: a built-in member is opaque, any other key is missing. */
function builtInIndex(index: IrType): Evaluation {
  const key = indexKey(index);
  const isBuiltIn = key === null || key in String.prototype || key in Array.prototype;
  return isBuiltIn || key in Number.prototype ? OPAQUE : MISSING;
}
