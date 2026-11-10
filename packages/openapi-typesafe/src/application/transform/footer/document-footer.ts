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
import { OperationKeys } from "./operation-keys.js";
import { FIRST_SCHEMA_NAMES, type SharedEnumNames } from "./shared-enum-names.js";

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

/** Separates a repeated `--enum-values` array name from its number, as root type aliases do. */
const ENUM_VALUES_NUMBER_SEPARATOR = "_";

/** The whole declaration: an equal key means the same enum, member for member. */
function declarationKey(name: string, request: EnumDeclarationRequest): string {
  return JSON.stringify([name, request.values, request.metadata]);
}

/** The naming state a run's footer shares with the rest of the run. */
export interface RunFooterNames {
  readonly enums: EnumNameClaims;
  readonly operations: OperationKeys;
}

/**
 * The footer of one run: enums (deduplicated with `--dedupe-enums`), `--enum-values` arrays, the
 * helper types they need, and the `operations` interface. Replaces the original's module-level
 * `enumCache`, so runs no longer share enums (research/legacy-bugs.md, item 3).
 */
export class RunFooter implements DocumentFooter {
  private readonly naming = new EnumNaming();
  private readonly enumNamesByKey = new Map<string, string>();
  /** Declarations added already: the same one twice fails with "Duplicate identifier". */
  private readonly declaredEnums = new Set<string>();
  /** The member names of each declared enum, by value. */
  private readonly membersByEnum = new Map<string, Map<string | number, string>>();
  /** The members of each declared enum name, by member name. */
  private readonly declaredMembers = new Map<string, Map<string, string | number>>();
  /** `--enum-values` arrays added already: their declared name by name, type and values. */
  private readonly declaredEnumValues = new Map<string, string>();
  /** The declared `--enum-values` array names. */
  private readonly enumValuesNames = new Set<string>();
  private readonly sink: FooterSink;
  private readonly isDedupingEnums: boolean;
  private readonly sharedNames: SharedEnumNames;
  private readonly names: RunFooterNames;

  constructor(
    sink: FooterSink,
    isDedupingEnums: boolean,
    sharedNames: SharedEnumNames = FIRST_SCHEMA_NAMES,
    names: RunFooterNames = { enums: new EnumNameClaims(), operations: new OperationKeys() },
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
    const known = key === null ? undefined : this.enumNamesByKey.get(key);
    if (known !== undefined) {
      return known;
    }
    // The owner is the schema location: its requests share one enum, with `--dedupe-enums` too.
    const name = this.names.enums.nameFor(sharedName, request.name);
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
      this.enumNamesByKey.set(key, name);
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
    const declared = JSON.stringify([baseName, request.type, request.values]);
    if (this.declaredEnumValues.has(declared)) {
      return;
    }
    const name = this.freeEnumValuesName(baseName);
    this.declaredEnumValues.set(declared, name);
    this.enumValuesNames.add(name);
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

  /**
   * Another array may have the name: `Discount/type` and `discount/type`, or a property and an
   * inline `allOf` item of one schema, typed at one location. A redeclared `const` does not
   * compile, so a later one gets the next number (`discountTypeValues_2`). Every unnumbered name
   * ends with `Values`, so a number never takes a name that a later array needs.
   */
  private freeEnumValuesName(name: string): string {
    let candidate = name;
    for (let count = 2; this.enumValuesNames.has(candidate); count++) {
      candidate = `${name}${ENUM_VALUES_NUMBER_SEPARATOR}${count}`;
    }
    return candidate;
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
