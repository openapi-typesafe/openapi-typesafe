/**
 * The helper type aliases the generator adds to the footer, declared once each. The text is the
 * original's source text as the TypeScript printer printed it, so printing it as written gives
 * the original output (ENGINEERING_PLAN 6.2 and 6.6), except for the fixes noted below.
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
  // `unevaluated-properties` (roadmap R11): the value types of every member of a union, so a
  // `$ref` to a `oneOf` schema gives the values of each variant, not only of the shared keys.
  propertyValues: {
    name: "PropertyValues",
    text: "type PropertyValues<T> = T extends unknown ? T[keyof T] : never;",
  },
  // Task 7.4 changes the original text on purpose: `readonly unknown[]` also flattens the arrays
  // of `--immutable` (upstream #2714, #2749), and `NonNullable` looks through nullable parents
  // (upstream #2737). The old text did not compile for those schemas.
  flattenedDeepRequired: {
    name: "FlattenedDeepRequired",
    text: lines(
      "type FlattenedDeepRequired<T> = {",
      "    [K in keyof T]-?: FlattenedDeepRequired<T[K] extends readonly unknown[] | undefined | " +
        "null ? Extract<T[K], readonly unknown[]>[number] : NonNullable<T[K]>>;",
      "};",
    ),
  },
  // `readonly unknown[]`: a readonly array value type stays as is (upstream #2749).
  readonlyArray: {
    name: "ReadonlyArray",
    text: lines(
      "type ReadonlyArray<T> = [",
      "    Exclude<T, undefined>",
      "] extends [",
      "    readonly unknown[]",
      "] ? Readonly<Exclude<T, undefined>> : Readonly<Exclude<T, undefined>[]>;",
    ),
  },
} as const satisfies Readonly<Record<string, HelperType>>;

/**
 * The `--read-write-markers` helper types, written before the root types. Task 7.6 replaces the
 * original text on purpose (ADR-014): primitives (also branded), readonly arrays, tuples,
 * intersected arrays and null-only properties keep their types (upstream #2615, #2620, #2632,
 * #2717, #2765). The declarations equal `Readable` / `Writable` of openapi-typesafe-helpers
 * (`test/api/read-write-marker-types.test.ts`); the text is what the TypeScript printer prints.
 */
export const READ_WRITE_MARKER_TYPES = lines(
  "export type $Read<T> = {",
  "    readonly $read: T;",
  "};",
  "export type $Write<T> = {",
  "    readonly $write: T;",
  "};",
  "type ReadWritePrimitive = string | number | boolean | bigint | symbol | null | undefined;",
  "type ReadWriteLeaf = ReadWritePrimitive | ((...args: never) => unknown);",
  "type ReadWriteMarkedKeys<T, Marker> = {",
  "    [K in keyof T]-?: NonNullable<T[K]> extends never ? never : NonNullable<T[K]> " +
    "extends Marker ? K : never;",
  "}[keyof T];",
  'type ReadWriteResolveArray<T extends readonly unknown[], Resolved extends "read" | ' +
    '"write"> = T[number][] extends T ? T extends unknown[] ? ReadWriteResolve<T[number], ' +
    "Resolved>[] : readonly ReadWriteResolve<T[number], Resolved>[] : {",
  "    [K in keyof T]: ReadWriteResolve<T[K], Resolved>;",
  "};",
  'type ReadWriteResolve<T, Resolved extends "read" | "write"> = Resolved extends "read" ? ' +
    "Readable<T> : Writable<T>;",
  "export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> ? " +
    "Readable<U> : T extends ReadWriteLeaf ? T : T extends readonly unknown[] ? " +
    'ReadWriteResolveArray<T, "read"> : T extends object ? {',
  "    [K in keyof T as K extends ReadWriteMarkedKeys<T, $Write<any>> ? never : K]: " +
    "Readable<T[K]>;",
  "} : T;",
  "export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> ? " +
    "Writable<U> : T extends ReadWriteLeaf ? T : T extends readonly unknown[] ? " +
    'ReadWriteResolveArray<T, "write"> : T extends object ? {',
  "    [K in keyof T as K extends ReadWriteMarkedKeys<T, $Read<any>> ? never : K]: " +
    "Writable<T[K]>;",
  "} & {",
  "    [K in ReadWriteMarkedKeys<T, $Read<any>>]?: never;",
  "} : T;",
);
