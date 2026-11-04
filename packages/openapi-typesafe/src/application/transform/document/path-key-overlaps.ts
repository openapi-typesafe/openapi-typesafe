/**
 * `--path-params-as-types` overlaps (roadmap R10.2, backlog 28). A path key with parameters is an
 * index signature over a template literal type, such as `` `/apps/${string}` ``. `${string}` also
 * matches `/`, so that signature covers `/apps/regions` and `` `/apps/${string}/restart` `` as
 * well, and TypeScript requires the covered keys' types to be assignable to its type (TS2411,
 * TS2413). These functions find the signatures that cover another key the checker rejects.
 */

/** A placeholder of a template literal type, by the type it stands for. */
export type PathPlaceholder = "string" | "number" | "boolean";

/** One part of a path key: text, or a placeholder. */
export type PathKeyPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "placeholder"; readonly type: PathPlaceholder };

/** A path key: a URL written as a property, or a template literal type of an index signature. */
export type PathKey =
  | { readonly kind: "literal"; readonly url: string }
  | { readonly kind: "template"; readonly parts: readonly PathKeyPart[] };

const BOOLEAN_TEXTS: readonly string[] = ["true", "false"];

/** The text one placeholder stands for in a sample of a template key. */
const SAMPLE_TEXTS: Readonly<Record<PathPlaceholder, string>> = {
  string: "",
  number: "0",
  boolean: "true",
};

/** TypeScript's rule for `${number}`: a text that converts to a finite number. */
function isNumberText(text: string): boolean {
  return text !== "" && Number.isFinite(Number(text));
}

function isPlaceholderText(type: PathPlaceholder, text: string): boolean {
  if (type === "number") {
    return isNumberText(text);
  }
  return type === "boolean" ? BOOLEAN_TEXTS.includes(text) : true;
}

/** Whether `text` from `start` on is one of the strings the parts from `index` on describe. */
function matchesFrom(
  text: string,
  start: number,
  parts: readonly PathKeyPart[],
  index: number,
): boolean {
  const part = parts[index];
  if (part === undefined) {
    return start === text.length;
  }
  if (part.kind === "text") {
    return (
      text.startsWith(part.text, start) &&
      matchesFrom(text, start + part.text.length, parts, index + 1)
    );
  }
  for (let end = start; end <= text.length; end += 1) {
    if (
      isPlaceholderText(part.type, text.slice(start, end)) &&
      matchesFrom(text, end, parts, index + 1)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * One string of the key. If a template key is covered, every string of it is, so a sample that is
 * not covered proves the key is not; a sample that is covered may over-report, which only moves a
 * signature that did not need it (the types stay the same, see `pathsObjectType`).
 */
function sampleOf(key: PathKey): string {
  if (key.kind === "literal") {
    return key.url;
  }
  return key.parts
    .map((part) => (part.kind === "text" ? part.text : SAMPLE_TEXTS[part.type]))
    .join("");
}

/** Whether TypeScript rejects the key at `covered` for the signature at `covering`. */
export type CoverRejection = (covering: number, covered: number) => boolean;

/** Without type information every covered key counts. */
const EVERY_COVER_REJECTED: CoverRejection = () => true;

/** The indexes of the template keys that cover another key of the list, where it is rejected. */
export function coveringTemplateKeys(
  keys: readonly PathKey[],
  isRejected: CoverRejection = EVERY_COVER_REJECTED,
): ReadonlySet<number> {
  const covering = new Set<number>();
  keys.forEach((key, index) => {
    if (key.kind !== "template") {
      return;
    }
    const isCovering = keys.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        matchesFrom(sampleOf(other), 0, key.parts, 0) &&
        isRejected(index, otherIndex),
    );
    if (isCovering) {
      covering.add(index);
    }
  });
  return covering;
}
