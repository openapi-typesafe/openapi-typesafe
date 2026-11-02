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

/**
 * The `--read-write-markers` helper types, written before the root types. As above, the text is
 * the original's source as the TypeScript printer printed it.
 */
export const READ_WRITE_MARKER_TYPES = lines(
  "export type $Read<T> = {",
  "    readonly $read: T;",
  "};",
  "export type $Write<T> = {",
  "    readonly $write: T;",
  "};",
  "export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> ? " +
    "Readable<U> : T extends (infer E)[] ? Readable<E>[] : T extends object ? {",
  "    [K in keyof T as NonNullable<T[K]> extends $Write<any> ? never : K]: Readable<T[K]>;",
  "} : T;",
  "export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> ? " +
    "Writable<U> : T extends (infer E)[] ? Writable<E>[] : T extends object ? {",
  "    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? never : K]: Writable<T[K]>;",
  "} & {",
  "    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? K : never]?: never;",
  "} : T;",
);
