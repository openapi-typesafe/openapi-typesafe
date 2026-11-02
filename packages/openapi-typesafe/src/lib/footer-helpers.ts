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
