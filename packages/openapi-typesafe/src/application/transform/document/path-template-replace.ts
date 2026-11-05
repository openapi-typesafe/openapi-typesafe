import type { PathKeyPart, PathPlaceholder } from "./path-key-overlaps.js";

/**
 * The `--path-params-as-types` key as the original builds it: each `{name}` match, in URL order,
 * replaces the first occurrence of its text in the key so far. A parameter named `number`,
 * `string` or `boolean` can so hit the `${number}` an earlier parameter got: of
 * `/a/{id}/b/{number}` the original makes `/a/$${number}/b/{number}`. That output compiles, so it
 * stays the default (ADR-021); the `path-param-type-names` fix gives every match its own
 * placeholder.
 */

/** One `{name}` of the URL and the placeholder of its parameter's type. */
export interface PathParameterMatch {
  readonly match: string;
  readonly type: PathPlaceholder;
}

/**
 * One UTF-16 code unit of the key so far (`indexOf` counts those): URL text, or a unit of the
 * placeholder that the match at `owner` inserted.
 */
interface KeyUnit {
  readonly unit: string;
  readonly owner: number | null;
}

const URL_TEXT = null;

/** `${type}`: the text of a template literal type placeholder. */
export function placeholderText(type: PathPlaceholder): string {
  return `\${${type}}`;
}

/** The key's units after each match replaced the first occurrence of its text. */
function replacedUnits(url: string, matches: readonly PathParameterMatch[]): readonly KeyUnit[] {
  const units: KeyUnit[] = url.split("").map((unit) => ({ unit, owner: URL_TEXT }));
  matches.forEach(({ match, type }, owner) => {
    const at = units
      .map(({ unit }) => unit)
      .join("")
      .indexOf(match);
    if (at >= 0) {
      const inserted = placeholderText(type)
        .split("")
        .map((unit) => ({ unit, owner }));
      units.splice(at, match.length, ...inserted);
    }
  });
  return units;
}

/** The placeholders, by match, that no later match cut into. */
function intactPlaceholders(
  units: readonly KeyUnit[],
  matches: readonly PathParameterMatch[],
): ReadonlyMap<number, PathPlaceholder> {
  const intact = new Map<number, PathPlaceholder>();
  matches.forEach(({ type }, owner) => {
    const left = units.filter((unit) => unit.owner === owner).length;
    if (left === placeholderText(type).length) {
      intact.set(owner, type);
    }
  });
  return intact;
}

/**
 * The key as parts. What is left of a placeholder that a later match cut into (the `$` of
 * `$${number}`) is text, as TypeScript reads it.
 */
export function replacedTemplateParts(
  url: string,
  matches: readonly PathParameterMatch[],
): PathKeyPart[] {
  const units = replacedUnits(url, matches);
  const intact = intactPlaceholders(units, matches);
  const parts: PathKeyPart[] = [];
  let text = "";
  units.forEach(({ unit, owner }, index) => {
    const type = owner === URL_TEXT ? undefined : intact.get(owner);
    if (type === undefined) {
      text += unit;
    } else if (units[index - 1]?.owner !== owner) {
      parts.push({ kind: "text", text }, { kind: "placeholder", type });
      text = "";
    }
  });
  parts.push({ kind: "text", text });
  return parts;
}
