import type { IrType } from "../../../domain/ir/nodes.js";
import { NO_DECLARED_TYPES } from "../document/declared-types.js";
import { assignabilityProof } from "../document/type-assignability.js";
import { unionOf } from "../type-combinators.js";

/**
 * The index signature type with the property types it does not admit. TypeScript checks an index
 * signature against every key of a value, declared ones too, so `{ total: number } & { [key:
 * string]: string }` admits no value with `total` (with a required `total`, none at all). The
 * signature takes those property types too, as `unevaluated-properties` does. A property type
 * proven assignable adds nothing, so output that admitted its values stays; one the proof cannot
 * decide (a `$ref`) is added, member by member, so the union stays flat. `$defs` is a keyword, not
 * data, so it is not read.
 */
export function withPropertyTypes(indexType: IrType, propertyTypes: readonly IrType[]): IrType {
  const relate = assignabilityProof(NO_DECLARED_TYPES);
  const members = unionMembers(indexType);
  const added: IrType[] = [];
  // Each member of a property type joins the union on its own, unless the union admits it
  // already: `(string | null) | (string | null)` is written `string | null`.
  for (const member of propertyTypes.flatMap(unionMembers)) {
    if (relate(member, unionOf([...members, ...added])) !== "assignable") {
      added.push(member);
    }
  }
  // Without an added member the index type stays as printed before, repeats and all.
  return added.length === 0 ? indexType : unionOf([...members, ...added]);
}

const unionMembers = (type: IrType): readonly IrType[] =>
  type.kind === "union" ? type.types : [type];
