import ts from "typescript";
import type { IrPropertySignature } from "../../domain/ir/nodes.js";
import { toPropertySignature } from "./ir-to-typescript.js";

/**
 * TypeScript nodes that user code adds to the footer (`ctx.injectFooter`). The generator's own
 * footer entries are IR; these functions are the only places that read or change a user's node.
 */

/** Whether the node is a type alias with this name (the original's helper check). */
export function isTypeAliasNamed(node: ts.Node, name: string): boolean {
  return ts.isTypeAliasDeclaration(node) && node.name.text === name;
}

/** The node as an interface with this name, or null. */
export function asInterfaceNamed(node: ts.Node, name: string): ts.InterfaceDeclaration | null {
  return ts.isInterfaceDeclaration(node) && node.name.text === name ? node : null;
}

/**
 * Add a member to a user's interface in place, as the original `injectOperationObject` did:
 * other references to the node see the member.
 */
export function appendMember(node: ts.InterfaceDeclaration, member: IrPropertySignature): void {
  (node as { members: ts.NodeArray<ts.TypeElement> }).members = ts.factory.createNodeArray([
    ...node.members,
    toPropertySignature(member),
  ]);
}
