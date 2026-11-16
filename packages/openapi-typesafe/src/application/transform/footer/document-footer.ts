import { irReference } from "../../../domain/ir/constructors.js";
import type {
  IrDeclaration,
  IrEnumDeclaration,
  IrPropertySignature,
  IrType,
} from "../../../domain/ir/nodes.js";
import { HELPER_TYPES, type HelperType } from "../helper-types.js";
import type {
  EnumDeclarationRequest,
  EnumMemberMetadata,
  EnumValuesRequest,
} from "../schema/schema-context.js";
import type { DocumentFooter } from "../transform-context.js";
import { EnumNameClaims } from "./enum-name-claims.js";
import {
  type DeclaredMembers,
  EnumNaming,
  enumDeclaration,
  withoutDeclaredMembers,
} from "./enum-naming.js";
import { EnumOwners } from "./enum-owners.js";
import { EnumValuesNames } from "./enum-values-names.js";
import { OperationKeys } from "./operation-keys.js";
import { FIRST_SCHEMA_NAMES, type SharedEnumNames } from "./shared-enum-names.js";
import type { ClaimPlace } from "./walk-ranks.js";

/** Where footer declarations go, in order: the run's `ctx.injectFooter`, open to user code. */
export interface FooterSink {
  /** Whether a type alias with this name is declared already (by the generator or a user). */
  hasTypeAlias(name: string): boolean;
  add(declaration: IrDeclaration): void;
  /** Add a member to the `operations` interface, declared first if needed; see `DocumentFooter`. */
  addOperation(build: () => IrPropertySignature): void;
}

/**
 * The `--dedupe-enums` key. Two enums share a declaration only when the original shares it and
 * each value has the same name and description in both. The original key pairs the values in
 * default sort order with the metadata at the sorted position, not with the value's own metadata,
 * so `[desc, asc]` and `[asc, desc]`, both named `[Desc, Asc]`, shared one declaration, and one of
 * them typed `asc` as `Desc = "desc"`. The original also joined `name:description` texts with
 * `,`, and a member name stood in for its value, so enums with other values (`"1"` and `1`, `A`
 * and `1` both named `Active`, `["a", "b"]` and `["a:,b"]`) shared one key. As JSON, an equal key
 * means the same values and metadata; enums the original kept apart still are.
 */
function dedupeKey(request: EnumDeclarationRequest): string {
  const sorted = [...request.values].sort(compareAsStrings);
  const originalPairs = sorted.map((value, index) => memberKey(value, request.metadata[index]));
  const ownPairs = request.values
    .map((value, index) => ({ value, member: memberKey(value, request.metadata[index]) }))
    .sort((left, right) => compareAsStrings(left.value, right.value))
    .map(({ member }) => member);
  return JSON.stringify([originalPairs, ownPairs]);
}

/** `Array.prototype.sort` without a comparator: compares the values as strings. */
function compareAsStrings(left: string | number, right: string | number): number {
  const leftText = String(left);
  const rightText = String(right);
  if (leftText === rightText) {
    return 0;
  }
  return leftText < rightText ? -1 : 1;
}

/** One member: the value (JSON keeps `"1"` and `1` apart), its name and its description. */
function memberKey(value: string | number, metadata: EnumMemberMetadata | undefined) {
  return [value, metadata?.name ?? null, metadata?.description || null];
}

/** Where the walk of the document met a request (`WalkRanks`). */
function placeOf(request: EnumDeclarationRequest | EnumValuesRequest): ClaimPlace {
  return { walkedAt: request.walkedAt, position: request.tupleIndex };
}

/**
 * The place a request gives the claim of `asked`: its own place where its location gives that
 * name (`ownName`), none where it only shares the enum of another name (`--dedupe-enums`). With
 * `Sort: [a]` and `Pair: [b], [a]` sharing `[a]` as `Pair`, `[a]` ranks at its position in
 * `Pair`, not at the one in `Sort`, so the order of `Sort` and `Pair` changes no name.
 */
function placeAsking(request: EnumDeclarationRequest, ownName: string, asked: string): ClaimPlace {
  return ownName === asked ? placeOf(request) : {};
}

/** The whole declaration: an equal key means the same enum, member for member. */
function declarationKey(name: string, request: EnumDeclarationRequest): string {
  return JSON.stringify([name, request.values, request.metadata]);
}

/** A `--dedupe-enums` enum: its name and the claim that gave it (`EnumNameClaims.nameFor`). */
interface DedupedEnum {
  readonly name: string;
  readonly asked: string;
  readonly owner: string;
}

/** The naming state a run's footer shares with the rest of the run. */
export interface RunFooterNames {
  readonly enums: EnumNameClaims;
  readonly owners: EnumOwners;
  readonly enumValues: EnumValuesNames;
  readonly operations: OperationKeys;
}

/** The naming state of a footer outside a run. */
function freshNames(): RunFooterNames {
  return {
    enums: new EnumNameClaims(),
    owners: new EnumOwners(),
    enumValues: new EnumValuesNames(),
    operations: new OperationKeys(),
  };
}

/**
 * The footer of one run: enums (deduplicated with `--dedupe-enums`), `--enum-values` arrays, the
 * helper types they need, and the `operations` interface. Replaces the original's module-level
 * `enumCache`, so runs no longer share enums (research/legacy-bugs.md, item 3).
 */
export class RunFooter implements DocumentFooter {
  private readonly naming = new EnumNaming();
  private readonly enumsByKey = new Map<string, DedupedEnum>();
  /** Declarations added already: the same one twice fails with "Duplicate identifier". */
  private readonly declaredEnums = new Set<string>();
  /** The member names of each declared enum, by value. */
  private readonly membersByEnum = new Map<string, Map<string | number, string>>();
  /** The members of each declared enum name, by member name. */
  private readonly declaredMembers = new Map<string, Map<string, string | number>>();
  private readonly sink: FooterSink;
  private readonly isDedupingEnums: boolean;
  private readonly sharedNames: SharedEnumNames;
  private readonly names: RunFooterNames;

  constructor(
    sink: FooterSink,
    isDedupingEnums: boolean,
    sharedNames: SharedEnumNames = FIRST_SCHEMA_NAMES,
    names: RunFooterNames = freshNames(),
  ) {
    this.sink = sink;
    this.isDedupingEnums = isDedupingEnums;
    this.sharedNames = sharedNames;
    this.names = names;
  }

  addEnum(request: EnumDeclarationRequest): string {
    // The name is built before the cache lookup: it advances the naming state either way.
    const ownName = this.naming.enumName(request.name);
    const key = this.isDedupingEnums ? dedupeKey(request) : null;
    // Every schema of a shared enum goes to `sharedNames`, the later ones too.
    const sharedName = key === null ? ownName : this.sharedNames.nameOf(key, ownName, request);
    const known = key === null ? undefined : this.enumsByKey.get(key);
    if (known !== undefined) {
      return this.dedupedName(known, ownName, request);
    }
    // Requests of one owner share one enum, with `--dedupe-enums` too. The owner records the
    // values of the requests its enum declares, so a request that shares another enum has none.
    const owner = this.names.owners.ownerOf(request);
    const name = this.names.enums.nameFor(
      sharedName,
      owner,
      placeAsking(request, ownName, sharedName),
    );
    // Only a repeated member fails to compile; two empty declarations merge, so they stay.
    const declared = request.values.length > 0 ? declarationKey(name, request) : null;
    if (declared !== null && this.declaredEnums.has(declared)) {
      return name;
    }
    if (declared !== null) {
      this.declaredEnums.add(declared);
    }
    const declaration = this.withoutRepeats(enumDeclaration(name, request, this.naming));
    if (declaration !== null) {
      this.record(declaration);
      this.sink.add(declaration);
    }
    if (key !== null) {
      this.enumsByKey.set(key, { name, asked: sharedName, owner });
    }
    return name;
  }

  /**
   * The name of an enum `--dedupe-enums` declared already. Its claim still gets the place of a
   * request whose location gives the enum's name, whichever schema declared the enum or came
   * first (a `$ref`'s), so the enum ranks where the document asks for its name (`placeAsking`).
   */
  private dedupedName(
    known: DedupedEnum,
    ownName: string,
    request: EnumDeclarationRequest,
  ): string {
    this.names.enums.nameFor(known.asked, known.owner, placeAsking(request, ownName, known.asked));
    return known.name;
  }

  /** The declaration without members an earlier one of the name has; null when none is left. */
  private withoutRepeats(declaration: IrEnumDeclaration): IrEnumDeclaration | null {
    const earlier: DeclaredMembers | undefined = this.declaredMembers.get(declaration.name);
    if (earlier === undefined) {
      return declaration;
    }
    const merged = withoutDeclaredMembers(declaration, earlier);
    // Two empty declarations merge into one empty enum, which compiles, so the second stays.
    return merged.members.length === 0 && declaration.members.length > 0 ? null : merged;
  }

  /** The members of a declaration; the first member of a value names it. */
  private record(declaration: IrEnumDeclaration): void {
    const byName = this.declaredMembers.get(declaration.name) ?? new Map();
    const byValue = this.membersByEnum.get(declaration.name) ?? new Map();
    for (const member of declaration.members) {
      byName.set(member.name, member.value);
      if (!byValue.has(member.value)) {
        byValue.set(member.value, member.name);
      }
    }
    this.declaredMembers.set(declaration.name, byName);
    this.membersByEnum.set(declaration.name, byValue);
  }

  enumMembers(name: string): ReadonlyMap<string | number, string> {
    return this.membersByEnum.get(name) ?? new Map();
  }

  addEnumValues(request: EnumValuesRequest): void {
    const baseName = this.naming.arrayName(request.name);
    // The same array twice fails with "Cannot redeclare"; a schema typed twice adds it twice.
    const key = JSON.stringify([baseName, request.type, request.values]);
    const { name, isNew } = this.names.enumValues.nameFor(key, baseName, placeOf(request));
    if (!isNew) {
      return;
    }
    this.require(HELPER_TYPES.flattenedDeepRequired);
    this.require(HELPER_TYPES.readonlyArray);
    this.sink.add({
      kind: "constArray",
      name,
      isExported: true,
      type: readonlyArrayOf(request.type),
      values: request.values,
      comments: [],
    });
  }

  requireWithRequired(): void {
    this.require(HELPER_TYPES.withRequired);
  }

  requirePropertyValues(): void {
    this.require(HELPER_TYPES.propertyValues);
  }

  addOperation(build: () => IrPropertySignature): void {
    this.sink.addOperation(build);
  }

  operationKey(operationId: string): string {
    return this.names.operations.keyFor(operationId);
  }

  private require(helper: HelperType): void {
    if (!this.sink.hasTypeAlias(helper.name)) {
      this.sink.add({ kind: "rawDeclaration", name: helper.name, text: helper.text });
    }
  }
}

function readonlyArrayOf(type: IrType): IrType {
  return irReference(HELPER_TYPES.readonlyArray.name, [type]);
}
