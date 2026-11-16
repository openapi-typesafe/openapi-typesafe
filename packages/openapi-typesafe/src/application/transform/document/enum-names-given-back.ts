import type { IrDeclaration, IrEnumDeclaration } from "../../../domain/ir/nodes.js";
import { type DeclaredMembers, withoutDeclaredMembers } from "../footer/enum-naming.js";
import { HELPER_TYPES, READ_WRITE_MARKER_TYPES } from "../helper-types.js";
import { typeNamesDeclaredBy, typeNamesInText } from "./declared-type-names.js";
import { OPERATIONS_NAME, ROOT_KEYS } from "./document.js";
import { GLOBAL_TYPE_NAMES, globalTypeReferences } from "./global-type-references.js";
import { type IrNodeRecord, mappedIrNodes } from "./ir-nodes-mapped.js";
import { API_PATHS_NAME } from "./paths-enum.js";
import { isRootTypeAlias } from "./root-type-aliases.js";

/**
 * The second step of naming `--enum` declarations (`EnumNameClaims`): once the output is known,
 * an enum that gave way to a name the output turned out not to need gets that name back.
 */

/**
 * The type names the output of a document may need, besides its enums: the global types it may
 * refer to and the names the generator declares itself. An enum avoids them until the end.
 */
export const NAMES_THE_OUTPUT_MAY_NEED: ReadonlySet<string> = new Set([
  ...GLOBAL_TYPE_NAMES,
  ...Object.values(HELPER_TYPES).map(({ name }) => name),
  ...typeNamesInText(READ_WRITE_MARKER_TYPES),
  API_PATHS_NAME,
  ...ROOT_KEYS,
  OPERATIONS_NAME,
]);

/** The parts of a transformed document; the footer holds only IR declarations here. */
export interface DocumentParts {
  readonly body: readonly IrDeclaration[];
  readonly footer: readonly IrDeclaration[];
  readonly closing: readonly IrDeclaration[];
}

/**
 * The type names the output needs besides its enums: the globals it refers to, and the names of
 * its other declarations. Root aliases give way to enums (`renameTakenAliases`), so they count
 * for nothing.
 */
export function namesTheOutputNeeds({ body, footer, closing }: DocumentParts): Set<string> {
  const others = [
    ...body.filter((declaration) => !isRootTypeAlias(declaration)),
    ...footer.filter((declaration) => declaration.kind !== "enum"),
    ...closing,
  ];
  return new Set([
    ...globalTypeReferences([...body, ...footer, ...closing]),
    ...typeNamesDeclaredBy(others),
  ]);
}

/** The enum references the generator writes: `Name`, `Name.member` and `typeof Name`. */
const ENUM_REFERENCE_RE = /^(typeof )?([^.]+)(\..*)?$/s;

function renamedReference(name: string, renames: ReadonlyMap<string, string>): string {
  const match = ENUM_REFERENCE_RE.exec(name);
  const renamed = match === null ? undefined : renames.get(match[2] ?? "");
  return renamed === undefined ? name : `${match?.[1] ?? ""}${renamed}${match?.[3] ?? ""}`;
}

function renamedNode(node: IrNodeRecord, renames: ReadonlyMap<string, string>): IrNodeRecord {
  const isNamed =
    (node.kind === "reference" || node.kind === "enum") && typeof node.name === "string";
  return isNamed ? { ...node, name: renamedReference(node.name as string, renames) } : node;
}

/** The declarations with each enum in `renames` (old name to new) renamed, references too. */
export function withEnumsRenamed<T extends IrDeclaration>(
  declarations: readonly T[],
  renames: ReadonlyMap<string, string>,
): T[] {
  if (renames.size === 0) {
    return [...declarations];
  }
  return [...(mappedIrNodes(declarations, (node) => renamedNode(node, renames)) as T[])];
}

/**
 * Each enum name's declarations as one: the first declaration with the members of every later
 * one that it does not have yet appended, in order (`withoutDeclaredMembers`).
 */
function wholeDeclarations(declarations: readonly IrEnumDeclaration[]) {
  const whole = new Map<string, IrEnumDeclaration>();
  for (const declaration of declarations) {
    const earlier = whole.get(declaration.name);
    if (earlier === undefined) {
      whole.set(declaration.name, declaration);
      continue;
    }
    const added = withoutDeclaredMembers(declaration, membersOf(earlier)).members;
    whole.set(declaration.name, { ...earlier, members: [...earlier.members, ...added] });
  }
  return whole;
}

/**
 * The entries with one declaration of each enum name, where the first was: the requests of one
 * owner ask for other values, and two owners can get one final name (`EnumNameClaims.finalNames`
 * joins them). TypeScript would merge several declarations, but a repeated member does not
 * compile (TS2300), so a member another declaration has already is left out (or numbered, where
 * its name has another value). `enumOf`: the entry as an enum declaration, null for any other.
 */
export function withEnumDeclarationsMerged<T>(
  entries: readonly T[],
  enumOf: (entry: T) => IrEnumDeclaration | null,
): (T | IrEnumDeclaration)[] {
  const declarations = entries.map(enumOf);
  const whole = wholeDeclarations(declarations.filter((entry) => entry !== null));
  const written = new Set<string>();
  const merged: (T | IrEnumDeclaration)[] = [];
  entries.forEach((entry, index) => {
    const name = declarations[index]?.name;
    if (name === undefined) {
      merged.push(entry);
    } else if (!written.has(name)) {
      written.add(name);
      merged.push(whole.get(name) ?? entry);
    }
  });
  return merged;
}

function membersOf(declaration: IrEnumDeclaration): DeclaredMembers {
  return new Map(declaration.members.map((member) => [member.name, member.value]));
}
