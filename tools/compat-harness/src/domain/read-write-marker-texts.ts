/**
 * The `--read-write-markers` helper text before and after task 7.6 (ADR-014), as the generators
 * print it. The harness compares CLIs as black boxes, so it keeps its own copy of both texts.
 */

function lines(...parts: readonly string[]): string {
  return parts.join("\n");
}

/** `Readable` and `Writable` as the fork base prints them. */
export const FORK_BASE_READ_WRITE_TYPES = lines(
  "export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> " +
    "? Readable<U> : T extends (infer E)[] ? Readable<E>[] : T extends object ? {",
  "    [K in keyof T as NonNullable<T[K]> extends $Write<any> ? never : K]: " + "Readable<T[K]>;",
  "} : T;",
  "export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> " +
    "? Writable<U> : T extends (infer E)[] ? Writable<E>[] : T extends object ? {",
  "    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? never : K]: " + "Writable<T[K]>;",
  "} & {",
  "    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? K : never]?: never;",
  "} : T;",
);

/** The fixed helpers and `Readable` / `Writable` as the candidate prints them. */
export const FIXED_READ_WRITE_TYPES = lines(
  "type ReadWritePrimitive = string | number | boolean | bigint | symbol | null | " + "undefined;",
  "type ReadWriteMarkedKeys<T, Marker> = {",
  "    [K in keyof T]-?: NonNullable<T[K]> extends never ? never : NonNullable<T[K]> " +
    "extends Marker ? K : never;",
  "}[keyof T];",
  'type ReadWriteResolveArray<T extends readonly unknown[], Resolved extends "read" | ' +
    '"write"> = T[number][] extends T ? T extends unknown[] ? ' +
    "ReadWriteResolve<T[number], Resolved>[] : readonly ReadWriteResolve<T[number], " +
    "Resolved>[] : {",
  "    [K in keyof T]: ReadWriteResolve<T[K], Resolved>;",
  "};",
  'type ReadWriteResolve<T, Resolved extends "read" | "write"> = Resolved extends ' +
    '"read" ? Readable<T> : Writable<T>;',
  "export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> " +
    "? Readable<U> : T extends ReadWritePrimitive ? T : T extends readonly unknown[] ? " +
    'ReadWriteResolveArray<T, "read"> : T extends object ? {',
  "    [K in keyof T as K extends ReadWriteMarkedKeys<T, $Write<any>> ? never : K]: " +
    "Readable<T[K]>;",
  "} : T;",
  "export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> " +
    "? Writable<U> : T extends ReadWritePrimitive ? T : T extends readonly unknown[] ? " +
    'ReadWriteResolveArray<T, "write"> : T extends object ? {',
  "    [K in keyof T as K extends ReadWriteMarkedKeys<T, $Read<any>> ? never : K]: " +
    "Writable<T[K]>;",
  "} & {",
  "    [K in ReadWriteMarkedKeys<T, $Read<any>>]?: never;",
  "} : T;",
);
