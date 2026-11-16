import type { IrDeclaration, IrEnumDeclaration } from "../../../domain/ir/nodes.js";
import { type DeclaredMembers, withoutDeclaredMembers } from "../footer/enum-naming.js";
import { HELPER_TYPES, READ_WRITE_MARKER_TYPES } from "../helper-types.js";
import { typeNamesDeclaredBy, typeNamesInText } from "./declared-type-names.js";
import { OPERATIONS_NAME, ROOT_KEYS } from "./document.js";
import { GLOBAL_TYPE_NAMES, globalTypeReferences } from "./global-type-references.js";
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

/** `origin` holds the compiler node a raw type was printed from; it is not IR. */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(["origin"]);

/** The enum references the generator writes: `Name`, `Name.member` and `typeof Name`. */
const ENUM_REFERENCE_RE = /^(typeof )?([^.]+)(\..*)?$/s;

function renamedReference(name: string, renames: ReadonlyMap<string, string>): string {
  const match = ENUM_REFERENCE_RE.exec(name);
  const renamed = match === null ? undefined : renames.get(match[2] ?? "");
  return renamed === undefined ? name : `${match?.[1] ?? ""}${renamed}${match?.[3] ?? ""}`;
}

function isNode(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function renamedNode(value: unknown, renames: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => renamedNode(item, renames));
  }
  if (!isNode(value)) {
    return value;
  }
  const node = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SKIPPED_KEYS.has(key) ? child : renamedNode(child, renames),
    ]),
  );
  const isNamed =
    (node.kind === "reference" || node.kind === "enum") && typeof node.name === "string";
  return isNamed ? { ...node, name: renamedReference(node.name as string, renames) } : node;
}

/** The declarations with each enum in `renames` (old name to new) renamed, references too. */
export function withEnumsRenamed<T extends IrDeclaration>(
  declarations: readonly T[],
  renames: ReadonlyMap<string, string>,
): T[] {
  return renames.size === 0 ? [...declarations] : (renamedNode(declarations, renames) as T[]);
}

/**
 * The declarations with each later declaration of an enum name merged into the earlier ones: two
 * enums that get one final name (`EnumNameClaims.finalNames` joins two owners) repeat members,
 * which does not compile (TS2300). A declaration left without members goes; an empty enum's
 * first declaration stays. `enumOf`: the entry as an enum declaration, null for any other entry.
 */
export function withEnumDeclarationsMerged<T>(
  entries: readonly T[],
  enumOf: (entry: T) => IrEnumDeclaration | null,
): (T | IrEnumDeclaration)[] {
  const declared = new Map<string, DeclaredMembers>();
  const merged: (T | IrEnumDeclaration)[] = [];
  for (const entry of entries) {
    const declaration = enumOf(entry);
    if (declaration === null) {
      merged.push(entry);
      continue;
    }
    const earlier = declared.get(declaration.name);
    const kept = earlier === undefined ? declaration : withoutDeclaredMembers(declaration, earlier);
    declared.set(declaration.name, new Map([...(earlier ?? []), ...membersOf(kept)]));
    if (earlier === undefined || kept.members.length > 0) {
      merged.push(kept);
    }
  }
  return merged;
}

function membersOf(declaration: IrEnumDeclaration): Map<string, string | number> {
  return new Map(declaration.members.map((member) => [member.name, member.value]));
}
