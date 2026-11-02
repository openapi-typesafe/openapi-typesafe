import ts from "typescript";
import { toPropertySignature, toStatement } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import type { FooterSink } from "../application/transform/footer/document-footer.js";
import type { IrDeclaration, IrPropertySignature } from "../domain/ir/nodes.js";
import { injectOperation } from "./footer-helpers.js";

const OPERATIONS_NAME = "operations";

/**
 * Temporary sink (ENGINEERING_PLAN Phase 5–6): footer declarations go into the legacy
 * `ctx.injectFooter` list, which the Node API returns and user callbacks may add to. It also
 * remembers the IR of every node it adds, so the CLI can print the footer with our printer.
 */
export class LegacyFooterSink implements FooterSink {
  private readonly injectFooter: ts.Node[];
  private readonly declarations = new Map<ts.Node, IrDeclaration>();
  private readonly operationMembers: IrPropertySignature[] = [];
  private operationsNode: ts.InterfaceDeclaration | undefined;

  constructor(injectFooter: ts.Node[]) {
    this.injectFooter = injectFooter;
  }

  hasTypeAlias(name: string): boolean {
    return this.injectFooter.some((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name);
  }

  add(declaration: IrDeclaration): void {
    const statement = toStatement(declaration);
    this.declarations.set(statement, declaration);
    this.injectFooter.push(statement);
  }

  addOperation(build: () => IrPropertySignature): void {
    const before = new Set(this.injectFooter);
    injectOperation(this.injectFooter, () => {
      const member = build();
      this.operationMembers.push(member);
      return toPropertySignature(member);
    });
    this.operationsNode ??= this.injectFooter.find(
      (node): node is ts.InterfaceDeclaration =>
        !before.has(node) && ts.isInterfaceDeclaration(node) && node.name.text === OPERATIONS_NAME,
    );
  }

  /**
   * The IR of a footer node this sink added, or null for a node from elsewhere (a user callback)
   * and for an `operations` interface whose members were changed outside this sink.
   */
  declarationOf(node: ts.Node): IrDeclaration | null {
    if (node === this.operationsNode) {
      return this.operationsDeclaration(this.operationsNode);
    }
    return this.declarations.get(node) ?? null;
  }

  private operationsDeclaration(node: ts.InterfaceDeclaration): IrDeclaration | null {
    if (node.members.length !== this.operationMembers.length) {
      return null;
    }
    return {
      kind: "interface",
      name: OPERATIONS_NAME,
      isExported: true,
      members: [...this.operationMembers],
      comments: [],
    };
  }
}
