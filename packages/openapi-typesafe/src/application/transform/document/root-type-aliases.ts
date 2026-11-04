import { irRaw } from "../../../domain/ir/constructors.js";
import type { IrDeclaration, IrTypeAliasDeclaration } from "../../../domain/ir/nodes.js";
import { escapeSingleQuotedText } from "../../../domain/ir/raw-text-escapes.js";
import type { ComponentKind } from "../../../domain/openapi/components-object.js";

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

function isRootTypeAlias(declaration: IrDeclaration): declaration is IrTypeAliasDeclaration {
  return (
    declaration.kind === "typeAlias" &&
    declaration.type.kind === "raw" &&
    declaration.type.text.startsWith(REFERENCE_PREFIX)
  );
}

/**
 * The type names the footer declares that an alias must not take: enums, and helper types such as
 * `WithRequired`. Value declarations (`--enum-values` arrays) live in another namespace.
 */
function footerTypeNames(declarations: readonly IrDeclaration[]): Set<string> {
  return new Set(
    declarations.flatMap((declaration) => {
      if (declaration.kind === "enum") {
        return [declaration.name];
      }
      return declaration.kind === "rawDeclaration" && declaration.name !== undefined
        ? [declaration.name]
        : [];
    }),
  );
}

function declaredNames(declarations: readonly IrDeclaration[]): Set<string> {
  return new Set(
    declarations.flatMap((declaration) =>
      "name" in declaration && declaration.name !== undefined ? [declaration.name] : [],
    ),
  );
}

function freeName(name: string, taken: ReadonlySet<string>): string {
  let candidate = `${name}_2`;
  for (let counter = 3; taken.has(candidate); counter++) {
    candidate = `${name}_${counter}`;
  }
  return candidate;
}

/**
 * With the `root-type-numbering` fix (ADR-021, roadmap R13, backlog 30): the aliases that a later
 * schema of one exported name took the name from, numbered `Name_2`, `Name_3`, … in document order
 * with the next free number. The later schema keeps the name, so the fix only adds exports.
 */
export function numberDisplacedAliases(
  displaced: readonly IrTypeAliasDeclaration[],
  kept: readonly IrTypeAliasDeclaration[],
): IrTypeAliasDeclaration[] {
  const taken = new Set(kept.map((alias) => alias.name));
  return displaced.map((alias) => {
    const name = freeName(alias.name, taken);
    taken.add(name);
    return { ...alias, name };
  });
}

/**
 * Rename each root alias whose name an enum or a helper type of the footer also declares, to the
 * next free `Name_2`, `Name_3`, … (the suffix `--root-types` uses for its own conflicts). The
 * footer keeps its names, because the generated types refer to them. Before, both were declared
 * under one name, which does not compile (enums: upstream #2099, #2341, #2206; helpers: a schema
 * named `WithRequired`, roadmap R11). Other declarations are returned unchanged.
 */
export function renameAliasesTakenByFooter(
  body: readonly IrDeclaration[],
  footer: readonly IrDeclaration[],
): IrDeclaration[] {
  const footerNames = footerTypeNames(footer);
  const taken = declaredNames([...body, ...footer]);
  return body.map((declaration) => {
    if (!isRootTypeAlias(declaration) || !footerNames.has(declaration.name)) {
      return declaration;
    }
    const name = freeName(declaration.name, taken);
    taken.add(name);
    return { ...declaration, name };
  });
}
