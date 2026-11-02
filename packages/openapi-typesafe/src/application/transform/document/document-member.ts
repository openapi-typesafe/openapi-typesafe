import { irProperty } from "../../../domain/ir/constructors.js";
import type { IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { withSchemaComment } from "../schema-comment.js";

export interface DocumentMemberFlags {
  readonly isReadonly: boolean;
  readonly isOptional?: boolean;
}

/** A member named by a document map key (media type, header, status code), with its JSDoc. */
export function documentMember(
  name: string,
  type: IrType,
  entry: unknown,
  flags: DocumentMemberFlags,
): IrPropertySignature {
  const property = irProperty(toPropertyName(name), type, flags);
  return withSchemaComment(property, entry);
}
