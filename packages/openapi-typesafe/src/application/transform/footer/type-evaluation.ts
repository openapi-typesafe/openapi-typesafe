import {
  irIndexedAccess,
  irIntersection,
  irObject,
  irProperty,
  irReference,
  irStringIndexSignature,
} from "../../../domain/ir/constructors.js";
import type { IrDeclaration, IrTupleType, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import {
  absorbed,
  type Evaluated,
  type Evaluation,
  intersectionType,
  OPAQUE,
  propertyKey,
  tupleAsArray,
  UNKNOWN,
  unionType,
} from "./evaluation.js";
import { isNullishMember } from "./intersection-parts.js";
import type { RawKeyTypes } from "./signature-index.js";
import { indexType } from "./type-indexing.js";
import { extracted, markerObject, omitted } from "./type-rules.js";

/**
 * A small evaluator of the generated types, as TypeScript reads them, for the `--enum-values`
 * check (ADR-027). It follows the declarations of the document and the helper types the generator
 * writes (`NonNullable`, `Extract`, `WithRequired`, `Omit`, `Record`, `Partial`,
 * `FlattenedDeepRequired`). Its answers are sure: a key is `missing` only where TypeScript
 * reports it, and every type it does not model is `opaque`, which never counts as an error.
 */

/** How many references one evaluation expands; a deeper one is opaque. */
const MAX_EXPANSIONS = 200;
const DEEP_HELPER = "FlattenedDeepRequired";
/** How many members distributing an intersection may give; more is opaque. */
const MAX_DISTRIBUTED = 64;

function isUndefinedKeyword(type: IrType | undefined): boolean {
  return type?.kind === "keyword" && type.keyword === "undefined";
}

/** Without templated paths no raw key has known key types. */
const NO_RAW_KEY_TYPES: RawKeyTypes = new Map();

export class TypeEvaluator {
  private readonly declared = new Map<string, IrType>();
  private expansions = 0;
  readonly keyTypes: RawKeyTypes;

  constructor(declarations: readonly IrDeclaration[], keyTypes = NO_RAW_KEY_TYPES) {
    this.keyTypes = keyTypes;
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
      case "tuple":
        return this.deepTuple(value, type);
      case "intersection":
        return this.withoutUnknownParts(value, type.types);
      case "raw":
        return OPAQUE;
      default:
        return value;
    }
  }

  /**
   * A tuple inside `FlattenedDeepRequired`, which maps it to a tuple again: indexing and the
   * `--enum-values` element read it as the array of its items (`tupleAsArray`). Outside it, or
   * with a rest element that is not an array type, it is opaque.
   */
  private deepTuple(value: Evaluated, tuple: IrTupleType): Evaluation {
    return value.deep && tupleAsArray(tuple) !== null ? value : OPAQUE;
  }

  /**
   * `X & unknown` is `X`, as TypeScript reads it: an `allOf` item that only describes. An array
   * or a tuple stays in its intersection, which indexing does not model (`hasArrayPart`): read
   * as `X[]`, a values array there would get a pointer type where it is typed by its values.
   */
  private withoutUnknownParts(value: Evaluated, parts: readonly IrType[]): Evaluation {
    const kept = parts.filter((part) => !(part.kind === "keyword" && part.keyword === "unknown"));
    if (kept.length === parts.length) {
      return value;
    }
    const rest = kept.length === 0 ? UNKNOWN : intersectionType(kept);
    const expanded = this.expand({ ...value, type: rest });
    const isArray = expanded.kind === "type" && ["array", "tuple"].includes(expanded.type.kind);
    return isArray ? value : expanded;
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
    const [first, second] = args;
    if (name === DEEP_HELPER && first?.kind === "reference" && first.typeArguments.length === 0) {
      const root = this.declared.get(first.name);
      return root === undefined ? OPAQUE : this.expand({ kind: "type", type: root, deep: true });
    }
    const declared = args.length === 0 ? this.declared.get(name) : undefined;
    if (declared !== undefined) {
      return this.expand({ ...value, type: declared });
    }
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
        return second === undefined ? argument : this.withRequired(argument, second);
      case "Readonly":
        return argument;
      case "Partial":
        // `FlattenedDeepRequired` makes every key required and its value non-null again, so
        // inside it `Partial<T>` is `T`; outside it each value may also be `undefined`.
        return argument.deep ? argument : OPAQUE;
      case "Extract":
        return second === undefined ? OPAQUE : this.extract(argument, second);
      case "Exclude":
        return isUndefinedKeyword(second) ? this.withoutUndefined(argument) : OPAQUE;
      case "Record":
        return second === undefined ? OPAQUE : stringRecord(argument, second);
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

  /** `Exclude<T, undefined>`, which a `$ref` to an optional property gets (ADR-026). */
  private withoutUndefined(value: Evaluated): Evaluation {
    const members = this.membersOf(value);
    if (members.some((member) => member.kind !== "type")) {
      return OPAQUE;
    }
    const kept = (members as Evaluated[]).filter((member) => !isUndefinedKeyword(member.type));
    return { ...value, type: unionType(kept.map((member) => member.type)) };
  }

  private withoutNullish(value: Evaluated): Evaluation {
    const members = this.membersOf(value);
    if (members.some((member) => member.kind !== "type")) {
      return OPAQUE;
    }
    const kept = (members as Evaluated[]).filter((member) => !isNullishMember(this, member));
    return { ...value, type: unionType(kept.map((member) => member.type)) };
  }

  /**
   * `WithRequired<T, K>` is `T & { [P in K]-?: T[P] }`: each key of `K` is required, so outside
   * `FlattenedDeepRequired` its value is not `undefined`. `NonNullable` stands in for `-?`, which
   * also drops `null`: the evaluator then reads a key as present that may be `null`, never one as
   * missing that is not. Keys other than string literals, or a `T` that is no object, leave `T`
   * as it is.
   */
  private withRequired(value: Evaluated, keys: IrType): Evaluation {
    const members = this.membersOf({ ...value, type: keys });
    const names = members.flatMap((member) =>
      member.kind === "type" && member.type.kind === "stringLiteral" ? [member.type] : [],
    );
    const isObject = value.type.kind === "object" || value.type.kind === "intersection";
    if (names.length !== members.length || !isObject) {
      return value;
    }
    const required = names.map((name) =>
      irProperty(
        toPropertyName(name.value),
        irReference("NonNullable", [irIndexedAccess(value.type, name)]),
      ),
    );
    return { ...value, type: irIntersection([value.type, irObject(required)]) };
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
    return indexType(this, value, index);
  }
}

/**
 * `Record<string, V>` as the object type it is, `{ [key: string]: V }`, so an intersection with it
 * reads its other parts' properties first. A record of other keys is opaque.
 */
function stringRecord(key: Evaluated, value: IrType): Evaluation {
  const isStringKey = key.type.kind === "keyword" && key.type.keyword === "string";
  return isStringKey ? { ...key, type: irObject([irStringIndexSignature("key", value)]) } : OPAQUE;
}
