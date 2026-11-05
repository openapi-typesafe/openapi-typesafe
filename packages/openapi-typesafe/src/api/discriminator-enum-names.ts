import type { SharedEnumNames } from "../application/transform/footer/shared-enum-names.js";
import type { EnumDeclarationRequest } from "../application/transform/schema/schema-context.js";

/**
 * `--dedupe-enums` names a shared enum after the first schema that declares it. With
 * `discriminator-values` and `--enum`, a member's value refers to the owner's enum, which is then
 * declared when the member is typed, maybe before that first schema; the shared enum would take
 * the owner's name. A first pass records the names of the declaring schemas only, so the second
 * pass names each shared enum as the document order does (`OtherKind`, not `PetPetType`).
 */
export class FirstSchemaNameRecorder implements SharedEnumNames {
  private readonly names = new Map<string, string>();

  nameOf(key: string, name: string, request: EnumDeclarationRequest): string {
    if (!request.isOwnerReference && !this.names.has(key)) {
      this.names.set(key, name);
    }
    return name;
  }

  /** The recorded name of each shared enum, for the second pass. */
  chosenNames(): SharedEnumNames {
    const chosen = new Map(this.names);
    return { nameOf: (key, name) => chosen.get(key) ?? name };
  }
}
