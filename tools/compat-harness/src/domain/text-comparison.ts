import {
  applyIntentionalDifferences,
  type IntentionalDifference,
} from "./intentional-differences.ts";
import { normalizeGeneratedOutput } from "./output-normalization.ts";

/** Result of comparing two generated files after normalization. */
export interface TextComparison {
  readonly isIdentical: boolean;
  /** 1-based line number of the first difference, or null when identical. */
  readonly firstDifferentLine: number | null;
  /**
   * Number of line positions whose content differs (a length difference counts every extra line).
   */
  readonly differentLineCount: number;
  /** Intentional differences that rewrote the golden text before the comparison. */
  readonly intentionalDifferenceIds: readonly string[];
}

/** Golden and candidate output as compared: normalized, the golden rewritten on purpose. */
export interface ComparableTexts {
  readonly golden: string;
  readonly candidate: string;
  readonly intentionalDifferenceIds: readonly string[];
}

/**
 * Both texts after `normalizeGeneratedOutput`, with the golden text rewritten by the intentional
 * differences first.
 */
export function comparableTexts(
  golden: string,
  candidate: string,
  intentionalDifferences: readonly IntentionalDifference[] = [],
): ComparableTexts {
  const rewritten = applyIntentionalDifferences(
    normalizeGeneratedOutput(golden),
    intentionalDifferences,
  );
  return {
    golden: rewritten.text,
    candidate: normalizeGeneratedOutput(candidate),
    intentionalDifferenceIds: rewritten.appliedIds,
  };
}

/** Compare golden and candidate output line by line as `comparableTexts` gives them. */
export function compareGeneratedTexts(
  golden: string,
  candidate: string,
  intentionalDifferences: readonly IntentionalDifference[] = [],
): TextComparison {
  return compareComparableTexts(comparableTexts(golden, candidate, intentionalDifferences));
}

/** Compare texts that `comparableTexts` prepared, line by line. */
export function compareComparableTexts(texts: ComparableTexts): TextComparison {
  const goldenLines = texts.golden.split("\n");
  const candidateLines = texts.candidate.split("\n");
  const lineCount = Math.max(goldenLines.length, candidateLines.length);

  let firstDifferentLine: number | null = null;
  let differentLineCount = 0;
  for (let index = 0; index < lineCount; index++) {
    if (goldenLines[index] !== candidateLines[index]) {
      differentLineCount++;
      firstDifferentLine ??= index + 1;
    }
  }
  return {
    isIdentical: differentLineCount === 0,
    firstDifferentLine,
    differentLineCount,
    intentionalDifferenceIds: texts.intentionalDifferenceIds,
  };
}
