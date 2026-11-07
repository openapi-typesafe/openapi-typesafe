import type { IrDeclaration, IrType } from "../../../domain/ir/nodes.js";
import {
  absorbed,
  type Evaluated,
  type Evaluation,
  intersectionType,
  isNullish,
  OPAQUE,
  propertyKey,
  unionType,
} from "./evaluation.js";
import { indexType } from "./type-indexing.js";
import { extracted, markerObject, omitted } from "./type-rules.js";

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
    return indexType(this, value, index);
  }
}
