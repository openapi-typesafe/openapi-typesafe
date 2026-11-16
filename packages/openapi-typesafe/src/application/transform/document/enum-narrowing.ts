import { irReference } from "../../../domain/ir/constructors.js";
import type { IrDeclaration, IrEnumDeclaration, IrType } from "../../../domain/ir/nodes.js";
import { enumMemberType } from "../enum-member-type.js";
import { unionOf } from "../type-combinators.js";
import { type IrNodeRecord, mappedIrNodes } from "./ir-nodes-mapped.js";

type EnumValue = string | number;

/** The member name of each value of each enum: the first member of a value names it. */
function memberNames(
  declarations: readonly IrEnumDeclaration[],
): Map<string, Map<EnumValue, string>> {
  const byEnum = new Map<string, Map<EnumValue, string>>();
  for (const declaration of declarations) {
    const byValue = byEnum.get(declaration.name) ?? new Map<EnumValue, string>();
    for (const member of declaration.members) {
      if (!byValue.has(member.value)) {
        byValue.set(member.value, member.name);
      }
    }
    byEnum.set(declaration.name, byValue);
  }
  return byEnum;
}

/**
 * The type of a reference to the enum `name` for `listed` values: the union of their members
 * (`Mode.a | Mode.c`) where the enum has other values too, else the whole enum. A value the enum
 * has no member of leaves the whole enum: no narrower type admits it.
 */
function narrowedType(
  name: string,
  listed: readonly EnumValue[],
  members: ReadonlyMap<EnumValue, string>,
): IrType {
  const values = [...new Set(listed)];
  const names = values.map((value) => members.get(value));
  const isWhole = [...members.keys()].every((value) => values.includes(value));
  if (isWhole || names.some((member) => member === undefined)) {
    return irReference(name);
  }
  return unionOf(names.map((member) => enumMemberType(name, member as string)));
}

function narrowedNode(
  node: IrNodeRecord,
  members: ReadonlyMap<string, ReadonlyMap<EnumValue, string>>,
): IrNodeRecord | IrType {
  if (node.kind !== "reference" || !Array.isArray(node.enumValues)) {
    return node;
  }
  const name = node.name as string;
  return narrowedType(name, node.enumValues as EnumValue[], members.get(name) ?? new Map());
}

/**
 * The declarations with each `--enum` reference typed by the values its schema lists
 * (`IrReferenceType.enumValues`), once `enums` holds every member of the run's enums. Requests
 * of one owner share one enum (a property and an inline `allOf` item of one schema), which has
 * the values of all of them, so a request of fewer values admits only its own: `Mode.a`, not
 * `Mode`. Which requests have fewer values is known only at the end of the run.
 */
export function withEnumReferencesNarrowed<T extends IrDeclaration>(
  declarations: readonly T[],
  enums: readonly IrEnumDeclaration[],
): T[] {
  const members = memberNames(enums);
  return [...(mappedIrNodes(declarations, (node) => narrowedNode(node, members)) as T[])];
}
