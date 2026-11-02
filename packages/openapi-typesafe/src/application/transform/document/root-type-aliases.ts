import { irRaw } from "../../../domain/ir/constructors.js";
import type { IrDeclaration, IrTypeAliasDeclaration } from "../../../domain/ir/nodes.js";
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
    // The original writes the reference as text, with single quotes.
    type: irRaw(`${REFERENCE_PREFIX}${kind}']['${item}']`),
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

function enumNames(declarations: readonly IrDeclaration[]): Set<string> {
  return new Set(
    declarations.flatMap((declaration) => (declaration.kind === "enum" ? [declaration.name] : [])),
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
 * Rename each root alias whose name an enum of the footer also declares, to the next free
 * `Name_2`, `Name_3`, … (the suffix `--root-types` uses for its own conflicts). The enum keeps its
 * name, because the generated types refer to it. Before, both were exported under one name, which
 * does not compile (upstream #2099, #2341, #2206). Other declarations are returned unchanged.
 */
export function renameAliasesTakenByEnums(
  body: readonly IrDeclaration[],
  footer: readonly IrDeclaration[],
): IrDeclaration[] {
  const enums = enumNames(footer);
  const taken = declaredNames([...body, ...footer]);
  return body.map((declaration) => {
    if (!isRootTypeAlias(declaration) || !enums.has(declaration.name)) {
      return declaration;
    }
    const name = freeName(declaration.name, taken);
    taken.add(name);
    return { ...declaration, name };
  });
}
