/**
 * Whether a key type is assignable to a template literal key type, decided the way TypeScript's
 * checker decides it (`inferFromLiteralPartsToTemplateLiteral` and
 * `isValidTypeForTemplateLiteralPlaceholder` in TypeScript 5 and 6). An index signature checks
 * exactly the keys that are assignable to its key type, so the overlap check must match the
 * checker, not the strings a template stands for: the checker matches each text of the target at
 * its first occurrence, so it misses some keys a regular expression would match, and a key it
 * misses is never checked against the signature.
 */

/** A placeholder type of a template, after `${boolean}` became the texts `true` and `false`. */
export type TemplatePlaceholder = "string" | "number";

/**
 * A key type as TypeScript stores a template literal: texts around placeholders, one more text
 * than placeholders. A string literal is one text and no placeholder.
 */
export interface TemplateShape {
  readonly texts: readonly string[];
  readonly types: readonly TemplatePlaceholder[];
}

/** The type the checker infers for one target placeholder: a text, or a slice of the source. */
type InferredMatch =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "template"; readonly shape: TemplateShape };

/** TypeScript's `isValidNumberString(text, false)`: a text that converts to a finite number. */
export function isNumberText(text: string): boolean {
  return text !== "" && Number.isFinite(Number(text));
}

/** Whether the inferred type fits a placeholder: any string for `string`, a number for `number`. */
function isValidMatch(match: InferredMatch, placeholder: TemplatePlaceholder): boolean {
  if (placeholder === "string") {
    return true;
  }
  if (match.kind === "text") {
    return isNumberText(match.text);
  }
  const { texts, types } = match.shape;
  return texts.length === 2 && texts[0] === "" && texts[1] === "" && types[0] === "number";
}

/** The state of the scan through the source: the current text and the position in it. */
interface Cursor {
  readonly segment: number;
  readonly position: number;
}

/** The scan of `inferFromLiteralPartsToTemplateLiteral`, over one source and one target. */
class LiteralPartsScan {
  private readonly matches: InferredMatch[] = [];
  private cursor: Cursor;
  private readonly source: TemplateShape;
  private readonly lastSourceIndex: number;
  private readonly remainingEndText: string;

  constructor(source: TemplateShape, startPosition: number, endTextLength: number) {
    this.source = source;
    this.lastSourceIndex = source.texts.length - 1;
    const endText = source.texts[this.lastSourceIndex] ?? "";
    this.remainingEndText = endText.slice(0, endText.length - endTextLength);
    this.cursor = { segment: 0, position: startPosition };
  }

  /** The matches for the target's texts between its first and last; null when one is missing. */
  run(delimiters: readonly string[]): readonly InferredMatch[] | null {
    for (const delimiter of delimiters) {
      if (!this.matchDelimiter(delimiter)) {
        return null;
      }
    }
    this.addMatch(this.lastSourceIndex, this.sourceText(this.lastSourceIndex).length);
    return this.matches;
  }

  private matchDelimiter(delimiter: string): boolean {
    const { segment, position } = this.cursor;
    if (delimiter.length > 0) {
      const found = this.find(delimiter);
      if (found === null) {
        return false;
      }
      this.addMatch(found.segment, found.position);
      this.cursor = { ...this.cursor, position: this.cursor.position + delimiter.length };
      return true;
    }
    if (position < this.sourceText(segment).length) {
      this.addMatch(segment, position + 1);
      return true;
    }
    if (segment < this.lastSourceIndex) {
      this.addMatch(segment + 1, 0);
      return true;
    }
    return false;
  }

  /** The first occurrence of the delimiter at or after the cursor, in this or a later text. */
  private find(delimiter: string): Cursor | null {
    let { segment, position } = this.cursor;
    while (segment < this.source.texts.length) {
      const index = this.sourceText(segment).indexOf(delimiter, position);
      if (index >= 0) {
        return { segment, position: index };
      }
      segment += 1;
      position = 0;
    }
    return null;
  }

  private sourceText(index: number): string {
    return index < this.lastSourceIndex ? (this.source.texts[index] ?? "") : this.remainingEndText;
  }

  private addMatch(segment: number, position: number): void {
    const start = this.cursor;
    if (segment === start.segment) {
      const text = this.sourceText(segment).slice(start.position, position);
      this.matches.push({ kind: "text", text });
    } else {
      const texts = [
        (this.source.texts[start.segment] ?? "").slice(start.position),
        ...this.source.texts.slice(start.segment + 1, segment),
        this.sourceText(segment).slice(0, position),
      ];
      const types = this.source.types.slice(start.segment, segment);
      this.matches.push({ kind: "template", shape: { texts, types } });
    }
    this.cursor = { segment, position };
  }
}

/** The checker's inferences for the target's placeholders; null when the texts do not fit. */
function inferMatches(
  source: TemplateShape,
  target: TemplateShape,
): readonly InferredMatch[] | null {
  const sourceStart = source.texts[0] ?? "";
  const sourceEnd = source.texts[source.texts.length - 1] ?? "";
  const targetStart = target.texts[0] ?? "";
  const targetEnd = target.texts[target.texts.length - 1] ?? "";
  const isTooShort =
    source.texts.length === 1 && sourceStart.length < targetStart.length + targetEnd.length;
  if (isTooShort || !sourceStart.startsWith(targetStart) || !sourceEnd.endsWith(targetEnd)) {
    return null;
  }
  const scan = new LiteralPartsScan(source, targetStart.length, targetEnd.length);
  return scan.run(target.texts.slice(1, -1));
}

function haveSameTexts(source: TemplateShape, target: TemplateShape): boolean {
  return (
    source.texts.length === target.texts.length &&
    source.texts.every((text, index) => text === target.texts[index])
  );
}

/**
 * Whether the source key type is assignable to the target template. Templates with the same texts
 * compare placeholder by placeholder (`inferTypesFromTemplateLiteralType`).
 */
export function isAssignableToTemplate(source: TemplateShape, target: TemplateShape): boolean {
  if (source.types.length > 0 && haveSameTexts(source, target)) {
    return source.types.every((type, index) => {
      const placeholder = target.types[index];
      return placeholder === "string" || type === placeholder;
    });
  }
  const matches = inferMatches(source, target);
  const isEveryMatchValid = matches?.every((match, index) => {
    const placeholder = target.types[index];
    return placeholder !== undefined && isValidMatch(match, placeholder);
  });
  return isEveryMatchValid === true;
}
