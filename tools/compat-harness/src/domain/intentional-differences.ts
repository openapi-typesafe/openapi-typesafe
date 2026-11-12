/**
 * Output changes the candidate makes on purpose: bug fixes of tasks 7.4 and 7.6 that change
 * output which did not compile or typed wrongly before (ENGINEERING_PLAN 7.4, ADR-014). The comparison rewrites the golden text with
 * each rule before comparing, and the report lists every rule with the cases it applied to, so a
 * fix does not hide other drift and stays visible.
 */
interface DifferenceDescription {
  readonly id: string;
  /**
   * Upstream issues the fix closes, as `owner/repo#number`, or the research note that records the
   * bug when nobody filed it upstream.
   */
  readonly issues: readonly string[];
  readonly description: string;
}

/** A difference a pattern finds in the text. */
export interface PatternDifference extends DifferenceDescription {
  /** What the golden output has; global and multiline, matched after normalization. */
  readonly golden: RegExp;
  /**
   * What the candidate writes instead: a replacement for `golden` (`$1` refers to groups), or a
   * function of the match and its first group when the rewrite is more than a substitution.
   */
  readonly candidate: string | ((match: string, group: string) => string);
}

/** A difference only the types of the whole text decide, so it rewrites the text itself. */
export interface TextDifference extends DifferenceDescription {
  readonly rewrite: (golden: string) => string;
}

export type IntentionalDifference = PatternDifference | TextDifference;

import {
  OBJECT_WITH_INDEX_SIGNATURE,
  withIndexPropertyTypes,
} from "./index-signature-property-types.ts";
import { FIXED_READ_WRITE_TYPES, FORK_BASE_READ_WRITE_TYPES } from "./read-write-marker-texts.ts";
import { type WidenedEnumValuesFinder, withOwnValuesTypes } from "./widened-enum-values.ts";

const UPSTREAM = "openapi-ts/openapi-typescript";
const LEGACY_BUGS = "research/legacy-bugs.md";
/** A character that cannot be part of a TypeScript identifier (ADR-019 uses the same table). */
const NON_IDENTIFIER_CHARACTER = /[^\p{ID_Continue}$\u200C\u200D]/gu;

/** A pattern that matches `text` literally. */
function literalPattern(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gm");
}

/** A replacement that inserts `text` literally (`$` starts a pattern in replacements). */
function literalReplacement(text: string): string {
  return text.replaceAll("$", "$$$$");
}

export const INTENTIONAL_DIFFERENCES: readonly PatternDifference[] = [
  {
    id: "enum-empty-member-name",
    issues: [`${UPSTREAM}#2807`, `${UPSTREAM}#2812`],
    description: '`--enum`: an empty string value gets the member name `""` instead of none',
    golden: /^( +) = ""(,?)$/gm,
    candidate: '$1"" = ""$2',
  },
  {
    id: "enum-values-flattened-deep-required",
    issues: [`${UPSTREAM}#2714`, `${UPSTREAM}#2737`],
    description:
      "`--enum-values`: `FlattenedDeepRequired` flattens readonly arrays and nullable parents",
    golden:
      /^( {4}\[K in keyof T\]-\?: FlattenedDeepRequired<T\[K\] extends )unknown\[\] \| undefined \| null \? Extract<T\[K\], unknown\[\]>\[number\] : T\[K\]>;$/gm,
    candidate:
      "$1readonly unknown[] | undefined | null ? Extract<T[K], readonly unknown[]>[number] : " +
      "NonNullable<T[K]>>;",
  },
  {
    id: "enum-values-readonly-array",
    issues: [`${UPSTREAM}#2749`],
    description: "`--enum-values`: the `ReadonlyArray` helper accepts readonly arrays",
    golden: /^(\] extends \[\n {4})unknown\[\](\n\] \? Readonly<Exclude<T, undefined>>)/gm,
    candidate: "$1readonly unknown[]$2",
  },
  {
    id: "read-write-marker-helpers",
    issues: [
      `${UPSTREAM}#2615`,
      `${UPSTREAM}#2620`,
      `${UPSTREAM}#2632`,
      `${UPSTREAM}#2717`,
      `${UPSTREAM}#2765`,
    ],
    description:
      "`--read-write-markers`: `Readable` / `Writable` keep primitives, arrays, tuples and " +
      "null-only keys, and find the marked keys next to an index signature",
    golden: literalPattern(FORK_BASE_READ_WRITE_TYPES),
    candidate: literalReplacement(FIXED_READ_WRITE_TYPES),
  },
  {
    id: "enum-name-leading-digit",
    issues: [`${LEGACY_BUGS} item 15`],
    description: "`--enum`: a name that starts with a digit gets the `Value` prefix",
    // Only where a type name stands: the declaration and a property type.
    golden: /(?<=^export enum |^ +[^\s:]+\??: )(\d+[\p{L}_$][\p{ID_Continue}$]*)(?=[ ;[])/gmu,
    candidate: "Value$1",
  },
  {
    id: "root-type-name-identifier-characters",
    issues: [`${LEGACY_BUGS} item 16`],
    description:
      "`--root-types-keep-casing`: characters that cannot be in an identifier become `_`",
    // Kept casing applies to schema root types only, which always have the `Schema` prefix.
    golden: /^export type (Schema[^\s=<]*[^\p{ID_Continue}$\s=<][^\s=<]*) = /gmu,
    candidate: (_match, name) => `export type ${name.replace(NON_IDENTIFIER_CHARACTER, "_")} = `,
  },
  {
    id: "root-type-name-leading-digit",
    issues: [`${LEGACY_BUGS} item 16`],
    description:
      "`--root-types-no-schema-prefix`: a schema name that starts with a digit keeps its prefix",
    golden: /^export type (\d[^\s=<]*) = (?=components\['schemas'\])/gm,
    candidate: "export type Schema$1 = ",
  },
  {
    id: "index-signature-property-types",
    issues: [`${LEGACY_BUGS} item 20`],
    description:
      "An index signature next to properties of other types admits them: `{ a?: boolean } & " +
      "{ [key: string]: string[] }` becomes `string[] | boolean`",
    golden: OBJECT_WITH_INDEX_SIGNATURE,
    candidate: (match) => withIndexPropertyTypes(match),
  },
];

export interface RewrittenGolden {
  readonly text: string;
  /** Ids of the differences that changed the text, in catalog order. */
  readonly appliedIds: readonly string[];
}

/**
 * The pattern differences and the ones that read the types of the text. The latter run last: they
 * read the golden text as the other rules left it (the fixed `ReadonlyArray` helper).
 */
export function intentionalDifferences(
  findWidenedEnumValues: WidenedEnumValuesFinder,
): readonly IntentionalDifference[] {
  return [
    ...INTENTIONAL_DIFFERENCES,
    {
      id: "enum-values-widened-location",
      issues: [`${LEGACY_BUGS} item 21`],
      description:
        "`--enum-values`: an array whose location also admits other values (a `prefixItems` " +
        "element, an `anyOf` / `oneOf` member next to other values) is typed by its own values",
      rewrite: (golden) => withOwnValuesTypes(golden, findWidenedEnumValues),
    },
  ];
}

function rewriteWith(text: string, difference: IntentionalDifference): string {
  if ("rewrite" in difference) {
    return difference.rewrite(text);
  }
  const { golden: pattern, candidate } = difference;
  return typeof candidate === "string"
    ? text.replace(pattern, candidate)
    : text.replace(pattern, (match: string, group: string) => candidate(match, group));
}

/** Rewrite golden output with each intentional difference that matches it. */
export function applyIntentionalDifferences(
  golden: string,
  differences: readonly IntentionalDifference[],
): RewrittenGolden {
  let text = golden;
  const appliedIds: string[] = [];
  for (const difference of differences) {
    const rewritten = rewriteWith(text, difference);
    if (rewritten !== text) {
      appliedIds.push(difference.id);
      text = rewritten;
    }
  }
  return { text, appliedIds };
}
