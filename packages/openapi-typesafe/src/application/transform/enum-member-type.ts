import { irIndexedAccess, irReference, irString } from "../../domain/ir/constructors.js";
import type { IrType } from "../../domain/ir/nodes.js";

/**
 * The type of one member of a `--enum` enum (`Mode.fast`). A quoted member name cannot follow a
 * dot, so it is read by index: `typeof Mode["+"]` is the same type.
 */
export function enumMemberType(enumName: string, member: string): IrType {
  return member.startsWith('"')
    ? irIndexedAccess(irReference(`typeof ${enumName}`), irString(JSON.parse(member), "escaped"))
    : irReference(`${enumName}.${member}`);
}
