import { describe, expectTypeOf, it } from "vitest";
import type { $Read, $Write, Readable, Writable } from "../../src/helpers.js";

/**
 * `Readable` / `Writable` regressions from helpers 0.17 (task 7.6, ADR-014). Without markers both
 * must leave a type as it is; with markers they strip only the marked properties.
 */

type UserId = string & { readonly __brand: "UserId" };

type Tiny = { tinyProp: number };
type TinyFoo = { tinyFooProp: string } & Tiny;
type Little = { tinyOnes: Tiny[] };
type LittleFoo = { tinyOnes: TinyFoo[] } & Little;
type Foo = { "@type": "Foo"; littleOnes: LittleFoo[] };
type Bar = { "@type": "Bar"; littleOnes: Little[] };

describe("Readable without markers", () => {
  it("keeps readonly arrays as arrays (upstream #2615)", () => {
    expectTypeOf<Readable<{ items: readonly string[] }>>().toEqualTypeOf<{
      items: readonly string[];
    }>();
  });

  it("keeps tuples (upstream #2632, #2673, #2842)", () => {
    expectTypeOf<Readable<[string, number]>>().toEqualTypeOf<[string, number]>();
    expectTypeOf<Readable<readonly [string, ...number[]]>>().toEqualTypeOf<
      readonly [string, ...number[]]
    >();
  });

  it("keeps branded primitives (upstream #2765)", () => {
    expectTypeOf<Readable<{ id: UserId }>>().toEqualTypeOf<{ id: UserId }>();
  });

  it("keeps function types, so a Blob keeps its methods (--binary-as-blob, upstream #1214)", () => {
    expectTypeOf<Readable<{ read: () => Promise<string> }>>().toEqualTypeOf<{
      read: () => Promise<string>;
    }>();
    expectTypeOf<Readable<{ file: Blob }>["file"]>().toExtend<Blob>();
    expectTypeOf<Readable<{ file: Blob }>["file"]["arrayBuffer"]>().toEqualTypeOf<
      Blob["arrayBuffer"]
    >();
  });

  it("Writable accepts a File where the schema has a Blob", () => {
    expectTypeOf<File>().toExtend<Writable<{ file: Blob }>["file"]>();
    expectTypeOf<Writable<{ files: Blob[] }>["files"][number]>().toExtend<Blob>();
  });

  it("keeps `any` properties, which hand-written types can have", () => {
    // biome-ignore lint/suspicious/noExplicitAny: the property type under test
    type Thing = { id: string; meta: any; extra?: any };
    const body: Writable<Thing> = { id: "1", meta: { size: 1 } };

    expectTypeOf<Readable<Thing>["meta"]>().toBeAny();
    expectTypeOf<keyof Readable<Thing>>().toEqualTypeOf<"id" | "meta" | "extra">();
    expectTypeOf<Writable<Thing>["meta"]>().toBeAny();
    expectTypeOf<keyof Writable<Thing>>().toEqualTypeOf<"id" | "meta" | "extra">();
    expectTypeOf(body.id).toEqualTypeOf<string>();
  });

  it("keeps the elements of intersected arrays, so unions still narrow (upstream #2620)", () => {
    const data = {} as Readable<Foo | Bar>;

    if (data["@type"] === "Foo") {
      expectTypeOf(data.littleOnes[0]?.tinyOnes[0]?.tinyFooProp).toEqualTypeOf<
        string | undefined
      >();
    }
  });
});

describe("Readable and Writable with markers", () => {
  type Pet = { id: $Read<number>; secret: $Write<string>; tags: $Read<string>[] };

  it("Readable strips $Write and unwraps $Read", () => {
    expectTypeOf<Readable<Pet>>().toEqualTypeOf<{ id: number; tags: string[] }>();
  });

  it("Writable strips $Read and unwraps $Write", () => {
    expectTypeOf<Writable<Pet>>().toEqualTypeOf<
      { secret: string; tags: never[] } & { id?: never }
    >();
  });

  it("Writable keeps optional null-only properties (upstream #2717, #2825)", () => {
    type Body = { x?: null; y: $Read<number> };

    expectTypeOf<Writable<Body>>().toEqualTypeOf<{ x?: null } & { y?: never }>();
  });

  it("keeps `any` properties next to marked ones", () => {
    // biome-ignore lint/suspicious/noExplicitAny: the property type under test
    type Body = { meta: any; id: $Read<number>; secret: $Write<string> };

    expectTypeOf<Readable<Body>["meta"]>().toBeAny();
    expectTypeOf<keyof Readable<Body>>().toEqualTypeOf<"meta" | "id">();
    expectTypeOf<Writable<Body>["meta"]>().toBeAny();
    expectTypeOf<Writable<Body>["id"]>().toEqualTypeOf<undefined>();
    expectTypeOf<keyof Writable<Body>>().toEqualTypeOf<"meta" | "secret" | "id">();
  });

  it("Readable keeps optional undefined-only properties", () => {
    expectTypeOf<Readable<{ x?: undefined }>>().toEqualTypeOf<{ x?: undefined }>();
  });
});
