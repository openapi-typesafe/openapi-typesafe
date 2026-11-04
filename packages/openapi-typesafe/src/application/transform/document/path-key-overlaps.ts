/**
 * `--path-params-as-types` overlaps (roadmap R10.2, backlog 28). A path key with parameters is an
 * index signature over a template literal type, such as `` `/apps/${string}` ``. `${string}` also
 * matches `/`, so that signature covers `/apps/regions` and `` `/apps/${string}/restart` `` as
 * well, and TypeScript requires the covered keys' types to be assignable to its type (TS2411,
 * TS2413). These functions find the signatures that cover another key the checker rejects.
 */

import { isAssignableToTemplate, isNumberText, type TemplateShape } from "./template-key-match.js";

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
 * signature that did not need it (the types stay the same, see `pathsObjectType`). This is the
 * cover the original check used, kept so that the output it gave stays the same.
 */
function sampleOf(key: PathKey): string {
  if (key.kind === "literal") {
    return key.url;
  }
  return key.parts
    .map((part) => (part.kind === "text" ? part.text : SAMPLE_TEXTS[part.type]))
    .join("");
}

/** The shapes after one more part; a boolean placeholder doubles them, as TypeScript does. */
function withPart(shapes: readonly TemplateShape[], part: PathKeyPart): TemplateShape[] {
  return shapes.flatMap((shape): TemplateShape[] => {
    const lead = shape.texts.slice(0, -1);
    const last = shape.texts[shape.texts.length - 1] ?? "";
    if (part.kind === "text") {
      return [{ texts: [...lead, last + part.text], types: shape.types }];
    }
    if (part.type === "boolean") {
      return BOOLEAN_TEXTS.map((text) => ({ texts: [...lead, last + text], types: shape.types }));
    }
    return [{ texts: [...shape.texts, ""], types: [...shape.types, part.type] }];
  });
}

/**
 * The key types TypeScript makes of a key: a literal is one text; a template is one shape, or a
 * union of shapes when `${boolean}` is in it (`` `/a/${boolean}` `` is `"/a/true" | "/a/false"`).
 */
function shapesOf(key: PathKey): readonly TemplateShape[] {
  if (key.kind === "literal") {
    return [{ texts: [key.url], types: [] }];
  }
  return key.parts.reduce<TemplateShape[]>(withPart, [{ texts: [""], types: [] }]);
}

/**
 * Whether a signature checks the covered key: every type of the covered key is assignable to one
 * of the signature's types. A shape without placeholders (a boolean-only template) is a string
 * literal, which is no signature, so the targets leave it out.
 */
function isCoveredBy(
  sources: readonly TemplateShape[],
  targets: readonly TemplateShape[],
): boolean {
  return sources.every((source) =>
    targets.some((target) => isAssignableToTemplate(source, target)),
  );
}

/** Whether TypeScript rejects the key at `covered` for the signature at `covering`. */
export type CoverRejection = (covering: number, covered: number) => boolean;

/**
 * How the check decides that TypeScript rejects a covered key. `sampled` goes with the sampled
 * cover, as the original check did, with the path items' own types: its output stays the same.
 * `exact` goes only with the cover TypeScript itself checks, so it may read further (the types
 * that path items reference, upstream #1752) without moving a signature the checker accepts.
 */
export interface CoverChecks {
  readonly sampled: CoverRejection;
  readonly exact: CoverRejection;
}

/** Without type information every covered key counts. */
const EVERY_COVER_REJECTED: CoverRejection = () => true;
const EVERY_CHECK: CoverChecks = { sampled: EVERY_COVER_REJECTED, exact: EVERY_COVER_REJECTED };

/** The signature types of a template key; a boolean-only template is no signature (TS1337). */
function signatureShapes(key: PathKey): readonly TemplateShape[] {
  return shapesOf(key).filter((shape) => shape.types.length > 0);
}

/** The indexes of the template keys that cover another key of the list, where it is rejected. */
export function coveringTemplateKeys(
  keys: readonly PathKey[],
  checks: CoverChecks = EVERY_CHECK,
): ReadonlySet<number> {
  const covering = new Set<number>();
  const shapes = keys.map(shapesOf);
  keys.forEach((key, index) => {
    if (key.kind !== "template") {
      return;
    }
    const targets = signatureShapes(key);
    const isCovering = keys.some((other, otherIndex) => {
      // An exact cover is sampled too: a key the checker matches has every string matched.
      if (otherIndex === index || !matchesFrom(sampleOf(other), 0, key.parts, 0)) {
        return false;
      }
      return (
        checks.sampled(index, otherIndex) ||
        (isCoveredBy(shapes[otherIndex] ?? [], targets) && checks.exact(index, otherIndex))
      );
    });
    if (isCovering) {
      covering.add(index);
    }
  });
  return covering;
}
