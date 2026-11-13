import type { DocumentObject } from "../../../domain/openapi/document-object.js";
import { EnumNaming } from "./enum-naming.js";

/** A character an enum name keeps; a schema name with none names no enum (`EmptyEnumNameError`). */
const VALID_NAME_CHARACTER_RE = /[A-Za-z_$0-9]/;

/**
 * The enum name each component schema gives an enum typed at its own location: `Pair_2` for
 * `#/components/schemas/Pair_2` (named `/Pair_2`, whose leading `/` adds nothing to the name).
 * Every component counts, an enum or not, so the names are known before any schema is
 * transformed (`EnumNameClaims` keeps numbers off them).
 */
export function componentEnumNames(document: DocumentObject): ReadonlySet<string> {
  const keys = Object.keys(document.components?.schemas ?? {});
  return new Set(
    keys
      .filter((key) => VALID_NAME_CHARACTER_RE.test(key))
      // A fresh naming state per name, as the first use of the name would see it (`EnumNaming`).
      .map((key) => new EnumNaming().enumName(key)),
  );
}
