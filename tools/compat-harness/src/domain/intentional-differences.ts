/**
 * Output changes the candidate makes on purpose: bug fixes of task 7.4 that change output which
 * did not compile before (ENGINEERING_PLAN 7.4). The comparison rewrites the golden text with
 * each rule before comparing, and the report lists every rule with the cases it applied to, so a
 * fix does not hide other drift and stays visible.
 */
export interface IntentionalDifference {
  readonly id: string;
  /** Upstream issues the fix closes, as `owner/repo#number`. */
  readonly issues: readonly string[];
  readonly description: string;
  /** What the golden output has; global and multiline, matched after normalization. */
  readonly golden: RegExp;
  /** What the candidate writes instead: a replacement for `golden` (`$1` refers to groups). */
  readonly candidate: string;
}

const UPSTREAM = "openapi-ts/openapi-typescript";

export const INTENTIONAL_DIFFERENCES: readonly IntentionalDifference[] = [
  {
    id: "enum-empty-member-name",
    issues: [`${UPSTREAM}#2807`, `${UPSTREAM}#2812`],
    description: '`--enum`: an empty string value gets the member name `""` instead of none',
    golden: /^( +) = ""(,?)$/gm,
    candidate: '$1"" = ""$2',
  },
];

export interface RewrittenGolden {
  readonly text: string;
  /** Ids of the differences that changed the text, in catalog order. */
  readonly appliedIds: readonly string[];
}

/** Rewrite golden output with each intentional difference that matches it. */
export function applyIntentionalDifferences(
  golden: string,
  differences: readonly IntentionalDifference[],
): RewrittenGolden {
  let text = golden;
  const appliedIds: string[] = [];
  for (const difference of differences) {
    const rewritten = text.replace(difference.golden, difference.candidate);
    if (rewritten !== text) {
      appliedIds.push(difference.id);
      text = rewritten;
    }
  }
  return { text, appliedIds };
}
