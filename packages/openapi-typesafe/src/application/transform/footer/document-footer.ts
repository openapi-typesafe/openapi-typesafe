import { irReference } from "../../../domain/ir/constructors.js";
import type { IrDeclaration, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { HELPER_TYPES, type HelperType } from "../helper-types.js";
import type {
  EnumDeclarationRequest,
  EnumMemberMetadata,
  EnumValuesRequest,
} from "../schema/schema-context.js";
import type { DocumentFooter } from "../transform-context.js";
import { EnumNaming, enumDeclaration } from "./enum-naming.js";

/** Where footer declarations go, in order: the run's `ctx.injectFooter`, open to user code. */
export interface FooterSink {
  /** Whether a type alias with this name is declared already (by the generator or a user). */
  hasTypeAlias(name: string): boolean;
  add(declaration: IrDeclaration): void;
  /** Add a member to the `operations` interface, declared first if needed; see `DocumentFooter`. */
  addOperation(build: () => IrPropertySignature): void;
}

/**
 * The `--dedupe-enums` key of the original: the values in default sort order, each paired with
 * the metadata at its sorted position (not the value's own metadata), as the original does.
 */
function dedupeKey(request: EnumDeclarationRequest): string {
  return [...request.values]
    .sort(compareAsStrings)
    .map((value, index) => metadataKey(String(value), request.metadata[index]))
    .join(",");
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

function metadataKey(value: string, metadata: EnumMemberMetadata | undefined): string {
  return `${metadata?.name ?? value}:${metadata?.description || ""}`;
}

/**
 * The footer of one run: enums (deduplicated with `--dedupe-enums`), `--enum-values` arrays, the
 * helper types they need, and the `operations` interface. Replaces the original's module-level
 * `enumCache`, so runs no longer share enums (research/legacy-bugs.md, item 3).
 */
export class RunFooter implements DocumentFooter {
  private readonly naming = new EnumNaming();
  private readonly enumNamesByKey = new Map<string, string>();
  private readonly sink: FooterSink;
  private readonly isDedupingEnums: boolean;

  constructor(sink: FooterSink, isDedupingEnums: boolean) {
    this.sink = sink;
    this.isDedupingEnums = isDedupingEnums;
  }

  addEnum(request: EnumDeclarationRequest): string {
    // The name is built before the cache lookup: it advances the naming state either way.
    const name = this.naming.enumName(request.name);
    const key = this.isDedupingEnums ? dedupeKey(request) : null;
    const known = key === null ? undefined : this.enumNamesByKey.get(key);
    if (known !== undefined) {
      return known;
    }
    this.sink.add(enumDeclaration(name, request, this.naming));
    if (key !== null) {
      this.enumNamesByKey.set(key, name);
    }
    return name;
  }

  addEnumValues(request: EnumValuesRequest): void {
    const name = this.naming.arrayName(request.name);
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

  addOperation(build: () => IrPropertySignature): void {
    this.sink.addOperation(build);
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
