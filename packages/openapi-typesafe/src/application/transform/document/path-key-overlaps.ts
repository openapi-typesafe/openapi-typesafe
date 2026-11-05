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
 * checks anything against it; a repeated one is still reported (TS2374, see `isSameTemplate`).
 */
function checkedShapes(key: PathKey): readonly TemplateShape[] {
  const shapes = shapesOf(key);
  return key.kind === "literal" ? shapes : shapes.filter((shape) => shape.types.length > 0);
}

/**
 * Whether two keys are the same template, as paths that differ only in parameter names give
 * (`/a/{id}`, `/a/{name}`). OpenAPI forbids such paths, and one object with both signatures fails
 * to compile whatever their types (TS2374), so each always counts as covering the other.
 */
function isSameTemplate(key: PathKey, other: PathKey): boolean {
  return (
    other.kind === "template" && JSON.stringify(shapesOf(key)) === JSON.stringify(shapesOf(other))
  );
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
  const covering = new Set<number>();
  const checked = keys.map((key) => ({ key, shapes: checkedShapes(key) }));
  checked.forEach(({ key, shapes: targets }, index) => {
    if (key.kind !== "template") {
      return;
    }
    const isCovering = checked.some((other, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }
      return (
        isSameTemplate(key, other.key) ||
        (isCoveredBy(other.shapes, targets) && isRejected(index, otherIndex))
      );
    });
    if (isCovering) {
      covering.add(index);
    }
  });
  return covering;
}
