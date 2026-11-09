import { irRaw } from "../../../domain/ir/constructors.js";
import type { IrDeclaration, IrTypeAliasDeclaration } from "../../../domain/ir/nodes.js";
import { escapeSingleQuotedText } from "../../../domain/ir/raw-text-escapes.js";
import type { ComponentKind } from "../../../domain/openapi/components-object.js";
import { freeNumberedName } from "../numbered-names.js";
import { typeNamesDeclaredBy } from "./declared-type-names.js";
import { globalTypeReferences } from "./global-type-references.js";

/** The `--root-types` aliases: `export type Pet = components['schemas']['Pet'];`. */

const REFERENCE_PREFIX = "components['";

/** The alias of one component. */
export function rootTypeAlias(
  name: string,
  kind: ComponentKind,
  item: string,
): IrTypeAliasDeclaration {
  return {
    kind: "typeAlias",
    name,
    isExported: true,
    // The original writes the reference as text, with single quotes, and did not escape the
    // name: a quote in it could add code to the generated file (intentional fix).
    type: irRaw(`${REFERENCE_PREFIX}${kind}']['${escapeSingleQuotedText(item)}']`),
    comments: [],
  };
}

/** Whether the declaration is a `--root-types` alias, which gives way to every other name. */
export function isRootTypeAlias(declaration: IrDeclaration): declaration is IrTypeAliasDeclaration {
  return (
    declaration.kind === "typeAlias" &&
    declaration.type.kind === "raw" &&
    declaration.type.text.startsWith(REFERENCE_PREFIX)
  );
}

function declaredNames(declarations: readonly IrDeclaration[]): Set<string> {
  return new Set(
    declarations.flatMap((declaration) =>
      "name" in declaration && declaration.name !== undefined ? [declaration.name] : [],
    ),
  );
}

/**
 * Rename each root alias whose name another declaration of the output also takes (an enum, a
 * helper type, the `--make-paths-enum` enum `ApiPaths`, a root interface, `--read-write-markers`
 * or `inject` types), or that shadows a TypeScript global type the output refers to (`Record` in
 * `Record<string, never>`), to the next free `Name_2`, `Name_3`, … (the suffix `--root-types` uses
 * for its own conflicts). The others and the globals keep their names, because the generated
 * types refer to them. Before, the output did not compile (enums: upstream #2099, #2341, #2206;
 * helpers: a schema named `WithRequired`, roadmap R11; globals: TS2315; `ApiPaths`: TS2567).
 * Other declarations are returned unchanged.
 *
 * With the `root-type-numbering` fix (ADR-021, roadmap R13, backlog 30) the body also holds the
 * aliases a later schema of one exported name took the name from, after the other aliases and
 * under that same name. Each gets the next free number in body order, after the alias that kept
 * the name got its own: so the fix only adds exports, and every other alias keeps the name it has
 * without the fix.
 */
export function renameTakenAliases<T extends IrDeclaration>(
  body: readonly T[],
  footer: readonly IrDeclaration[],
  closing: readonly IrDeclaration[] = [],
): T[] {
  const all = [...body, ...footer, ...closing];
  const others = all.filter((declaration) => !isRootTypeAlias(declaration));
  const reserved = new Set([...typeNamesDeclaredBy(others), ...globalTypeReferences(all)]);
  const taken = new Set([...declaredNames(all), ...typeNamesDeclaredBy(all)]);
  const aliasNames = new Set<string>();
  return body.map((declaration) => {
    if (!isRootTypeAlias(declaration)) {
      return declaration;
    }
    const isRepeated = aliasNames.has(declaration.name);
    aliasNames.add(declaration.name);
    if (!isRepeated && !reserved.has(declaration.name)) {
      return declaration;
    }
    const name = freeNumberedName(declaration.name, taken);
    taken.add(name);
    return { ...declaration, name };
  });
}
