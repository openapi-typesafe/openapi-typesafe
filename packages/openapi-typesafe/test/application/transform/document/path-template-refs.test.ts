import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { withTemplatePathRefs } from "../../../../src/application/transform/document/path-template-refs.js";
import { irIndexedAccess, irReference, irString } from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

const URL = "/items/{id}";
const KEYS = new Map([[URL, `\`/items/\${number}\``]]);

function alias(type: IrType): IrDeclaration {
  return { kind: "typeAlias", name: "A", isExported: false, type, comments: [] };
}

/** The printed type of `root["/items/{id}"]` after the rewrite. */
function rewritten(root: IrType): string {
  const [declaration] = withTemplatePathRefs(
    [alias(irIndexedAccess(root, irString(URL, "json")))],
    KEYS,
  );
  return printNodes([declaration as IrDeclaration]).trim();
}

describe("withTemplatePathRefs", () => {
  it("withTemplatePathRefs indexes paths and FlattenedDeepRequired<paths> by the template", () => {
    expect(rewritten(irReference("paths"))).toBe(`type A = paths[\`/items/\${number}\`];`);
    expect(rewritten(irReference("FlattenedDeepRequired", [irReference("paths")]))).toBe(
      `type A = FlattenedDeepRequired<paths>[\`/items/\${number}\`];`,
    );
  });

  it("withTemplatePathRefs keeps an index of another type or another argument", () => {
    expect(rewritten(irReference("Partial", [irReference("paths")]))).toBe(
      'type A = Partial<paths>["/items/{id}"];',
    );
    expect(rewritten(irReference("FlattenedDeepRequired", [irReference("components")]))).toBe(
      'type A = FlattenedDeepRequired<components>["/items/{id}"];',
    );
    const twoArguments = irReference("FlattenedDeepRequired", [
      irReference("paths"),
      irReference("paths"),
    ]);
    expect(rewritten(twoArguments)).toBe(
      'type A = FlattenedDeepRequired<paths, paths>["/items/{id}"];',
    );
    expect(rewritten(irReference("paths", [irReference("paths")]))).toBe(
      'type A = paths<paths>["/items/{id}"];',
    );
  });
});
