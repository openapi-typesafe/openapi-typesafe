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

/**
 * Compare golden and candidate output line by line after `normalizeGeneratedOutput`, with the
 * golden text rewritten by the intentional differences first.
 */
export function compareGeneratedTexts(
  golden: string,
  candidate: string,
  intentionalDifferences: readonly IntentionalDifference[] = [],
): TextComparison {
  const rewritten = applyIntentionalDifferences(
    normalizeGeneratedOutput(golden),
    intentionalDifferences,
  );
  const goldenLines = rewritten.text.split("\n");
  const candidateLines = normalizeGeneratedOutput(candidate).split("\n");
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
    intentionalDifferenceIds: rewritten.appliedIds,
  };
}
