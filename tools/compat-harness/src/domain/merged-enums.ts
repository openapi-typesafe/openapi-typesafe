/**
 * Enums that the golden generator declared twice under one name. TypeScript merges such enums
 * without an error, so each schema accepts the values of the other (RC4 G8); the current
 * generator numbers the later one (`Status_2`), which changes types of output that compiles.
 */

/** An enum declaration at the start of a line, as both generators print it. */
const ENUM_DECLARATION_RE =
  /^export (?:const |declare )*enum ([\p{ID_Start}_$][\p{ID_Continue}$]*)/gmu;

/** The names that more than one enum declaration of the text takes, in order of first repeat. */
export function mergedEnumNames(text: string): string[] {
  const seen = new Set<string>();
  const merged = new Set<string>();
  for (const [, name = ""] of text.matchAll(ENUM_DECLARATION_RE)) {
    if (seen.has(name)) {
      merged.add(name);
    }
    seen.add(name);
  }
  return [...merged];
}

/** Whether the candidate keeps apart enums that the golden text merged, and merges none itself. */
export function isEnumMergeFixed(goldenText: string, candidateText: string): boolean {
  return mergedEnumNames(goldenText).length > 0 && mergedEnumNames(candidateText).length === 0;
}
