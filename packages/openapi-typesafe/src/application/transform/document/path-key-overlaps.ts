/**
 * `--path-params-as-types` overlaps (roadmap R10.2, backlog 28). A path key with parameters is an
 * index signature over a template literal type, such as `` `/apps/${string}` ``. `${string}` also
 * matches `/`, so that signature covers `/apps/regions` and `` `/apps/${string}/restart` `` as
 * well, and TypeScript requires the covered keys' types to be assignable to its type (TS2411,
 * TS2413). These functions find the signatures that cover another key the checker rejects.
 */

import { isAssignableToTemplate, type TemplateShape } from "./template-key-match.js";

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

/** The shapes after one more part; a boolean placeholder doubles them, as TypeScript does. */
function withPart(shapes: readonly TemplateShape[], part: PathKeyPart): TemplateShape[] {
  return shapes.flatMap((shape): TemplateShape[] => {
    const lead = shape.texts.slice(0, -1);
    // A shape has one text more than it has placeholders, so it always has a last text.
    const last = shape.texts[shape.texts.length - 1] as string;
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
export function keyShapesOf(key: PathKey): readonly TemplateShape[] {
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
  return (
    sources.length > 0 &&
    sources.every((source) => targets.some((target) => isAssignableToTemplate(source, target)))
  );
}

/** Whether TypeScript rejects the key at `covered` for the signature at `covering`. */
export type CoverRejection = (covering: number, covered: number) => boolean;

/** Without type information every covered key counts. */
const EVERY_COVER_REJECTED: CoverRejection = () => true;

/**
 * The key types TypeScript checks against a signature: a literal's, or a template's signature
 * types. A boolean-only template is no signature (TS1337), so the checker neither checks it nor
 * checks anything against it; a repeated one is still reported (TS2374, see `repeatedTemplates`).
 */
function checkedShapes(key: PathKey): readonly TemplateShape[] {
  const shapes = keyShapesOf(key);
  return key.kind === "literal" ? shapes : shapes.filter((shape) => shape.types.length > 0);
}

/** A checked key: the key, the shapes TypeScript checks, and its template identity. */
interface CheckedKey {
  readonly key: PathKey;
  readonly shapes: readonly TemplateShape[];
  /** The key types written as one string, for templates; null for a literal. */
  readonly template: string | null;
}

function checkedKeyOf(key: PathKey): CheckedKey {
  const template = key.kind === "template" ? JSON.stringify(keyShapesOf(key)) : null;
  return { key, shapes: checkedShapes(key), template };
}

/**
 * The templates written more than once, as paths that differ only in parameter names give
 * (`/a/{id}`, `/a/{name}`). OpenAPI forbids such paths, and one object with both signatures fails
 * to compile whatever their types (TS2374), so each always counts as covering the other.
 */
function repeatedTemplates(checked: readonly CheckedKey[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { template } of checked) {
    if (template !== null) {
      (seen.has(template) ? repeated : seen).add(template);
    }
  }
  return repeated;
}

/**
 * The checked keys by the first text of each of their shapes, sorted. A key type is assignable to
 * a template only when its first text starts with the template's first text (both branches of
 * `isAssignableToTemplate`), so the keys a template can cover are one run of this list. Without
 * it the check compares every pair of keys, which takes minutes for 10 000 paths.
 */
interface StartTextIndex {
  readonly starts: readonly string[];
  readonly keyIndexes: readonly number[];
}

/** Code unit order: in it the strings that start with one prefix are adjacent. */
function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function startTextIndexOf(checked: readonly CheckedKey[]): StartTextIndex {
  const entries = checked.flatMap(({ shapes }, keyIndex) =>
    shapes.map((shape) => ({ start: shape.texts[0] as string, keyIndex })),
  );
  entries.sort((left, right) => compareCodeUnits(left.start, right.start));
  return {
    starts: entries.map((entry) => entry.start),
    keyIndexes: entries.map((entry) => entry.keyIndex),
  };
}

/** The indexes of the keys with a shape whose first text starts with one of the prefixes. */
function keysStartingWith(index: StartTextIndex, prefixes: readonly string[]): Set<number> {
  const found = new Set<number>();
  for (const prefix of prefixes) {
    let low = 0;
    let high = index.starts.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((index.starts[middle] as string) < prefix) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    for (let at = low; at < index.starts.length; at += 1) {
      if (!(index.starts[at] as string).startsWith(prefix)) {
        break;
      }
      found.add(index.keyIndexes[at] as number);
    }
  }
  return found;
}

/**
 * The indexes of the template keys that cover another key of the list, where it is rejected, or
 * that repeat another template key. A template covers the keys TypeScript checks against it, the
 * ones its own matching accepts (see `template-key-match.ts`), not every string it stands for:
 * `` `/a/b/${number}` `` is no `` `/${string}/${number}` `` to the checker, which does not
 * backtrack, so that pair is never checked.
 */
export function coveringTemplateKeys(
  keys: readonly PathKey[],
  isRejected: CoverRejection = EVERY_COVER_REJECTED,
): ReadonlySet<number> {
  const checked = keys.map(checkedKeyOf);
  const repeated = repeatedTemplates(checked);
  const startTexts = startTextIndexOf(checked);
  const covering = new Set<number>();
  checked.forEach(({ template, shapes: targets }, index) => {
    if (template === null) {
      return;
    }
    const prefixes = targets.map((target) => target.texts[0] as string);
    const candidates = [...keysStartingWith(startTexts, prefixes)].sort((a, b) => a - b);
    const isCovering =
      repeated.has(template) ||
      candidates.some(
        (otherIndex) =>
          otherIndex !== index &&
          isCoveredBy((checked[otherIndex] as CheckedKey).shapes, targets) &&
          isRejected(index, otherIndex),
      );
    if (isCovering) {
      covering.add(index);
    }
  });
  return covering;
}
