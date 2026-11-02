// The footer helpers of Phase 5 (src/lib/footer-helpers.ts before task 6.2), kept for the
// original footer adapter. Not linted: it is reference code.
import ts from "typescript";

const WITH_REQUIRED_NAME = "WithRequired";
const WITH_REQUIRED_SOURCE = "type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };";

/**
 * Add the `WithRequired` helper type to the footer once. Internal (not exported from the package);
 * shared by `tsWithRequired` and the schema transformer's footer adapter.
 */
export function injectWithRequiredHelper(injectFooter: ts.Node[]): void {
  const isDeclared = injectFooter.some(
    (node) => ts.isTypeAliasDeclaration(node) && node.name.escapedText === WITH_REQUIRED_NAME,
  );
  if (!isDeclared) {
    const source = ts.createSourceFile("stringInput", WITH_REQUIRED_SOURCE, ts.ScriptTarget.ESNext);
    injectFooter.push(source.statements[0] as ts.Statement);
  }
}

const OPERATIONS_NAME = "operations";

/**
 * Add a member to the footer's `operations` interface. The interface is created first if needed
 * (exported, never readonly), then `build` runs, so the interface precedes any declaration that
 * `build` adds to the footer, as in the original `injectOperationObject`.
 */
export function injectOperation(injectFooter: ts.Node[], build: () => ts.PropertySignature): void {
  let operations = injectFooter.find(
    (node): node is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(node) && node.name.text === OPERATIONS_NAME,
  );
  if (!operations) {
    operations = ts.factory.createInterfaceDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createIdentifier(OPERATIONS_NAME),
      undefined,
      undefined,
      [],
    );
    injectFooter.push(operations);
  }
  const member = build();
  // The original mutates the declaration in place; other references to it must see the member.
  (operations as { members: ts.NodeArray<ts.TypeElement> }).members = ts.factory.createNodeArray([
    ...operations.members,
    member,
  ]);
}
