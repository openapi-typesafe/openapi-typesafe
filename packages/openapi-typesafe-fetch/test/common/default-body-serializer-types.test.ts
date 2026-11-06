import { describe, expect, expectTypeOf, it } from "vitest";
import { defaultBodySerializer } from "../../src/index.js";

/**
 * The declared result of `defaultBodySerializer` is what it returns: a raw body as it is, an object
 * with a multipart `Content-Type` as `FormData`, and a string otherwise. It was declared `string`
 * for every body.
 */

const MULTIPART_HEADERS = { "Content-Type": "multipart/form-data" };

describe("defaultBodySerializer result type", () => {
  it("defaultBodySerializer of a raw body is that body", () => {
    const blob = new Blob(["x"]);
    const bytes = new Uint8Array([1]);

    const sentBlob = defaultBodySerializer(blob);
    const sentBytes = defaultBodySerializer(bytes, MULTIPART_HEADERS);

    expectTypeOf(sentBlob).toEqualTypeOf<Blob>();
    expectTypeOf(sentBytes).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
    expect([sentBlob, sentBytes]).toEqual([blob, bytes]);
  });

  it("defaultBodySerializer of an object without headers is a string", () => {
    const sent = defaultBodySerializer({ a: 1 });

    expectTypeOf(sent).toEqualTypeOf<string>();
    expect(sent).toBe('{"a":1}');
  });

  it("defaultBodySerializer of an object with headers may be FormData", () => {
    const sent = defaultBodySerializer({ a: "1" }, MULTIPART_HEADERS);

    expectTypeOf(sent).toEqualTypeOf<string | FormData>();
    expect(sent).toBeInstanceOf(FormData);
  });

  it("defaultBodySerializer of a primitive with headers is a string", () => {
    const sent = defaultBodySerializer(1, MULTIPART_HEADERS);

    expectTypeOf(sent).toEqualTypeOf<string>();
    expect(sent).toBe("1");
  });

  it("defaultBodySerializer of a union is the result of each member", () => {
    const body = new Blob(["x"]) as Blob | { a: number };

    const sent = defaultBodySerializer(body);

    expectTypeOf(sent).toEqualTypeOf<Blob | string>();
    expect(sent).toBe(body);
  });

  it("defaultBodySerializer of undefined is undefined", () => {
    const sent = defaultBodySerializer(undefined);

    expectTypeOf(sent).toEqualTypeOf<undefined>();
    expect(sent).toBeUndefined();
  });

  it("defaultBodySerializer of an unknown body may be any of its results", () => {
    const body: unknown = new URLSearchParams("a=1");

    const sent = defaultBodySerializer(body, MULTIPART_HEADERS);

    expectTypeOf(sent).toEqualTypeOf<
      FormData | Blob | URLSearchParams | ArrayBuffer | ArrayBufferView | string | undefined
    >();
    expect(sent).toBe(body);
  });
});
