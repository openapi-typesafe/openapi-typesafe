import { appendMember, asInterfaceNamed } from "../adapters/type-ast-bridge/footer-nodes.js";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import type { FooterSink } from "../application/transform/footer/document-footer.js";
import type {
  IrDeclaration,
  IrInterfaceDeclaration,
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
    const member = build();
    const operations = this.footer[index] as IrInterfaceDeclaration;
    this.footer[index] = { ...operations, members: [...operations.members, member] };
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

function emptyOperations(): IrInterfaceDeclaration {
  return { kind: "interface", name: OPERATIONS_NAME, isExported: true, members: [], comments: [] };
}
