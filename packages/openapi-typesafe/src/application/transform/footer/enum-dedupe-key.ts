import type { EnumDeclarationRequest, EnumMemberMetadata } from "../schema/schema-context.js";

/** `Array.prototype.sort` without a comparator: compares the values as strings. */
function compareAsStrings(left: string | number, right: string | number): number {
  const leftText = String(left);
  const rightText = String(right);
  if (leftText === rightText) {
    return 0;
  }
  return leftText < rightText ? -1 : 1;
}

/** One member: the value (JSON keeps `"1"` and `1` apart), its name and its description. */
function memberKey(value: string | number, metadata: EnumMemberMetadata | undefined) {
  return [value, metadata?.name ?? null, metadata?.description || null];
}

/**
 * The `--dedupe-enums` key of an enum's members. Two enums share a declaration only when the
 * original shares it and each value has the same name and description in both. The original key
 * pairs the values in default sort order with the metadata at the sorted position, not with the
 * value's own metadata, so `[desc, asc]` and `[asc, desc]`, both named `[Desc, Asc]`, shared one
 * declaration, and one of them typed `asc` as `Desc = "desc"`. The original also joined
 * `name:description` texts with `,`, and a member name stood in for its value, so enums with other
 * values (`"1"` and `1`, `A` and `1` both named `Active`, `["a", "b"]` and `["a:,b"]`) shared one
 * key. As JSON, an equal key means the same values and metadata; enums the original kept apart
 * still are.
 */
export function dedupeKey(request: Pick<EnumDeclarationRequest, "values" | "metadata">): string {
  const sorted = [...request.values].sort(compareAsStrings);
  const originalPairs = sorted.map((value, index) => memberKey(value, request.metadata[index]));
  const ownPairs = request.values
    .map((value, index) => ({ value, member: memberKey(value, request.metadata[index]) }))
    .sort((left, right) => compareAsStrings(left.value, right.value))
    .map(({ member }) => member);
  return JSON.stringify([originalPairs, ownPairs]);
}

type EnumMembers = Pick<EnumDeclarationRequest, "values" | "metadata">;

const NO_METADATA: EnumMemberMetadata = { name: undefined, description: undefined };

/**
 * The members of the requests of one owner as its one declaration has them: the first request's,
 * then each value a later request adds, with that request's metadata (`withEnumDeclarationsMerged`
 * appends the members an earlier declaration does not have). One request gives its own members.
 */
export function wholeMembers([first, ...later]: readonly EnumMembers[]): EnumMembers {
  const values = [...(first?.values ?? [])];
  const metadata = values.map((_value, index) => first?.metadata[index] ?? NO_METADATA);
  const seen = new Set(values.map((value) => JSON.stringify(value)));
  for (const request of later) {
    request.values.forEach((value, index) => {
      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        values.push(value);
        metadata.push(request.metadata[index] ?? NO_METADATA);
      }
    });
  }
  return { values, metadata };
}
