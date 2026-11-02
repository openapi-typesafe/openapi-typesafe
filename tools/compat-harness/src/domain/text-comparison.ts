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
}

/** Compare golden and candidate output line by line after `normalizeGeneratedOutput`. */
export function compareGeneratedTexts(golden: string, candidate: string): TextComparison {
  const goldenLines = normalizeGeneratedOutput(golden).split("\n");
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
  return { isIdentical: differentLineCount === 0, firstDifferentLine, differentLineCount };
}
