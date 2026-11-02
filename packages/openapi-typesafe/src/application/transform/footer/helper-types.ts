/**
 * The helper type aliases the generator adds to the footer, declared once each. The text is the
 * original's source text as the TypeScript printer printed it, so printing it as written gives
 * the original output (ENGINEERING_PLAN 6.2 and 6.6).
 */
export interface HelperType {
  readonly name: string;
  readonly text: string;
}

function lines(...parts: readonly string[]): string {
  return parts.join("\n");
}

export const HELPER_TYPES = {
  withRequired: {
    name: "WithRequired",
    text: lines("type WithRequired<T, K extends keyof T> = T & {", "    [P in K]-?: T[P];", "};"),
  },
  flattenedDeepRequired: {
    name: "FlattenedDeepRequired",
    text: lines(
      "type FlattenedDeepRequired<T> = {",
      "    [K in keyof T]-?: FlattenedDeepRequired<T[K] extends unknown[] | undefined | null " +
        "? Extract<T[K], unknown[]>[number] : T[K]>;",
      "};",
    ),
  },
  readonlyArray: {
    name: "ReadonlyArray",
    text: lines(
      "type ReadonlyArray<T> = [",
      "    Exclude<T, undefined>",
      "] extends [",
      "    unknown[]",
      "] ? Readonly<Exclude<T, undefined>> : Readonly<Exclude<T, undefined>[]>;",
    ),
  },
} as const satisfies Readonly<Record<string, HelperType>>;
