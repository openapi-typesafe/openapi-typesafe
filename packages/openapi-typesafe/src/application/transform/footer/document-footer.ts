import { irReference } from "../../../domain/ir/constructors.js";
import type {
  IrDeclaration,
  IrEnumDeclaration,
  IrPropertySignature,
  IrType,
} from "../../../domain/ir/nodes.js";
import { HELPER_TYPES, type HelperType } from "../helper-types.js";
import type { EnumDeclarationRequest, EnumValuesRequest } from "../schema/schema-context.js";
import type { DocumentFooter } from "../transform-context.js";
import { dedupeKey } from "./enum-dedupe-key.js";
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
import type { ClaimPlace } from "./walk-ranks.js";

/** Where footer declarations go, in order: the run's `ctx.injectFooter`, open to user code. */
export interface FooterSink {
  /** Whether a type alias with this name is declared already (by the generator or a user). */
  hasTypeAlias(name: string): boolean;
  add(declaration: IrDeclaration): void;
  /** Add a member to the `operations` interface, declared first if needed; see `DocumentFooter`. */
  addOperation(build: () => IrPropertySignature): void;
}

/** Where the walk of the document met a request (`WalkRanks`). */
function placeOf(request: EnumDeclarationRequest | EnumValuesRequest): ClaimPlace {
  return { walkedAt: request.walkedAt, position: request.tupleIndex };
}

/** The whole declaration: an equal key means the same enum, member for member. */
function declarationKey(name: string, request: EnumDeclarationRequest): string {
  return JSON.stringify([name, request.values, request.metadata]);
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
 * The footer of one run: enums, `--enum-values` arrays, the helper types they need, and the
 * `operations` interface. Replaces the original's module-level `enumCache`, so runs no longer
 * share enums (docs/internal/research/legacy-bugs.md, item 3).
 *
 * `--dedupe-enums` shares one enum between owners of the same members. A run shares them at its
 * end (`enumGrouping`), once each owner's members are known: an owner's requests may list other
 * values (a property and an inline `allOf` item), and sharing one of them would split the owner's
 * enum. Outside a run (the exported per-object transformers) there is no end, so the footer shares
 * an enum between requests of the same members as they come (`isDedupingEachRequest`), as the
 * original did.
 */
export class RunFooter implements DocumentFooter {
  private readonly naming = new EnumNaming();
  /** The name of the enum of each dedupe key, outside a run. */
  private readonly enumsByKey = new Map<string, string>();
  /** Declarations added already: the same one twice fails with "Duplicate identifier". */
  private readonly declaredEnums = new Set<string>();
  /** The member names of each declared enum, by value. */
  private readonly membersByEnum = new Map<string, Map<string | number, string>>();
  /** The members of each declared enum name, by member name. */
  private readonly declaredMembers = new Map<string, Map<string, string | number>>();
  private readonly sink: FooterSink;
  private readonly isDedupingEachRequest: boolean;
  private readonly names: RunFooterNames;

  /** `isDedupingEachRequest`: `--dedupe-enums` outside a run, which has no end to share at. */
  constructor(
    sink: FooterSink,
    isDedupingEachRequest: boolean,
    names: RunFooterNames = freshNames(),
  ) {
    this.sink = sink;
    this.isDedupingEachRequest = isDedupingEachRequest;
    this.names = names;
  }

  addEnum(request: EnumDeclarationRequest): string {
    // The name is built before the cache lookup: it advances the naming state either way.
    const ownName = this.naming.enumName(request.name);
    const key = this.isDedupingEachRequest ? dedupeKey(request) : null;
    const known = key === null ? undefined : this.enumsByKey.get(key);
    if (known !== undefined) {
      return known;
    }
    // Requests of one owner share one enum; the owner records the request.
    const owner = this.names.owners.ownerOf(request, ownName);
    const name = this.names.enums.nameFor(ownName, owner, placeOf(request));
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
      this.enumsByKey.set(key, name);
    }
    return name;
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
