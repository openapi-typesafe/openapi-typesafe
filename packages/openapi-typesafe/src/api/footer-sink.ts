import { appendMember, asInterfaceNamed } from "../adapters/type-ast-bridge/footer-nodes.js";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import type { FooterSink } from "../application/transform/footer/document-footer.js";
import type {
  IrDeclaration,
  IrInterfaceDeclaration,
  IrMember,
  IrPropertySignature,
} from "../domain/ir/nodes.js";
import { declaresTypeAlias, type FooterEntry, isIrDeclaration } from "./footer-entry.js";

const OPERATIONS_NAME = "operations";

/**
 * The footer of a run is its `ctx.injectFooter` list. The generator adds IR declarations; user
 * code may add IR declarations or TypeScript nodes (ENGINEERING_PLAN 6.2).
 */
export class ContextFooterSink implements FooterSink {
  private readonly footer: FooterEntry[];
  /**
   * The IR `operations` entry this sink wrote last, with its members array that only this sink
   * holds. Adding to it in place keeps a run linear: copying the members on every operation was
   * quadratic (about 0.4 s on Microsoft Graph beta).
   */
  private owned: OwnedOperations | null = null;

  constructor(footer: FooterEntry[]) {
    this.footer = footer;
  }

  hasTypeAlias(name: string): boolean {
    return this.footer.some((entry) => declaresTypeAlias(entry, name));
  }

  add(declaration: IrDeclaration): void {
    this.footer.push(declaration);
  }

  /**
   * Add a member to the `operations` interface, declared first (exported) when missing, so it
   * comes before any declaration `build` adds. A user's TypeScript `operations` interface gets
   * the member in place, as in the original.
   */
  addOperation(build: () => IrPropertySignature): void {
    const owned = this.currentOwnedOperations();
    if (owned !== null) {
      owned.members.push(build());
      return;
    }
    const existing = this.findOperations();
    if (existing !== null && !isIrDeclaration(existing.entry)) {
      const ts = loadTypeScript();
      const node = asInterfaceNamed(ts, existing.entry, OPERATIONS_NAME);
      if (node) {
        appendMember(ts, node, build());
      }
      return;
    }
    const index = existing?.index ?? this.footer.push(emptyOperations()) - 1;
    this.takeOwnership(index).members.push(build());
  }

  /** The owned entry, unless user code replaced or moved it in the footer since. */
  private currentOwnedOperations(): OwnedOperations | null {
    const owned = this.owned;
    return owned !== null && this.footer[owned.index] === owned.entry ? owned : null;
  }

  /** Replace the IR entry at `index` with a copy whose members array only this sink holds. */
  private takeOwnership(index: number): OwnedOperations {
    const operations = this.footer[index] as IrInterfaceDeclaration;
    const members: IrMember[] = [...operations.members];
    const entry: IrInterfaceDeclaration = { ...operations, members };
    this.footer[index] = entry;
    this.owned = { entry, members, index };
    return this.owned;
  }

  /** The first `operations` interface: the generator's (IR) or a user's (TypeScript). */
  private findOperations(): { entry: FooterEntry; index: number } | null {
    const index = this.footer.findIndex((entry) =>
      isIrDeclaration(entry)
        ? entry.kind === "interface" && entry.name === OPERATIONS_NAME
        : asInterfaceNamed(loadTypeScript(), entry, OPERATIONS_NAME) !== null,
    );
    const entry = this.footer[index];
    return entry === undefined ? null : { entry, index };
  }
}

interface OwnedOperations {
  readonly entry: IrInterfaceDeclaration;
  readonly members: IrMember[];
  readonly index: number;
}

function emptyOperations(): IrInterfaceDeclaration {
  return { kind: "interface", name: OPERATIONS_NAME, isExported: true, members: [], comments: [] };
}
