import { runInNewContext } from "node:vm";
import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

/**
 * Bodies whose JSON form is not their members: `Number`, `Boolean` and `String` objects, objects
 * with a `toJSON`, and typed arrays inside a body. The key must differ exactly when the fetch
 * client sends another request, so it is compared as TanStack Query hashes it.
 */

const NO_BASE_URL = { baseUrl: "" };
const MULTIPART = { "Content-Type": "multipart/form-data" };
const CAT = new File(["meow"], "cat.png", { type: "image/png" });
const DOG = new File(["woof woof"], "dog.jpg", { type: "image/jpeg" });

/** The hash TanStack Query gives the key init of a request with this body. */
function bodyHash(body: unknown, headers?: object): string {
  return hashKey([queryKeyInit({ body, headers }, NO_BASE_URL)]);
}

/** A form model with its own JSON form, as one written for logging without the file. */
class UploadForm {
  readonly file: File;

  constructor(file: File) {
    this.file = file;
  }

  toJSON(): object {
    return { kind: "upload" };
  }
}

describe("queryKeyInit Number, Boolean and String object bodies", () => {
  it("queryKeyInit with Number objects of other values gives other keys", () => {
    expect(bodyHash(new Number(1))).not.toBe(bodyHash(new Number(2)));
  });

  it("queryKeyInit with Number and Boolean objects keys them as their values", () => {
    expect(bodyHash(new Number(1))).toBe(bodyHash(1));
    expect(bodyHash(new Boolean(false))).toBe(bodyHash(false));
  });

  it("queryKeyInit with a String object keeps it apart from a JSON body of its characters", () => {
    expect(bodyHash(new String("ab"))).not.toBe(bodyHash({ 0: "a", 1: "b" }));
    expect(bodyHash(new String("ab"))).not.toBe(bodyHash(new String("ba")));
  });

  it("queryKeyInit with Number objects inside a body gives other keys", () => {
    expect(bodyHash({ n: new Number(1) })).not.toBe(bodyHash({ n: new Number(2) }));
  });

  it("queryKeyInit with Number objects of another realm gives other keys", () => {
    const one = runInNewContext("({ n: new Number(1) })");
    const two = runInNewContext("({ n: new Number(2) })");

    expect(bodyHash(one)).not.toBe(bodyHash(two));
    expect(bodyHash(runInNewContext("new Number(1)"))).toBe(bodyHash(1));
  });
});

describe("queryKeyInit body objects with a toJSON", () => {
  it("queryKeyInit with a toJSON object of other files gives other keys", () => {
    const cat = bodyHash(new UploadForm(CAT), MULTIPART);

    expect(cat).not.toBe(bodyHash(new UploadForm(DOG), MULTIPART));
    expect(bodyHash(new UploadForm(CAT))).not.toBe(bodyHash(new UploadForm(DOG)));
  });

  it("queryKeyInit with a toJSON object keys its fields by what a form body sends", () => {
    expect(queryKeyInit({ body: new UploadForm(CAT) }, NO_BASE_URL)).toEqual({
      body: { kind: "upload" },
      bodyFields: {
        body: { file: { type: "image/png", size: 4, name: "cat.png" } },
        bodyType: { file: "Blob" },
      },
    });
  });

  it("queryKeyInit with toJSON objects of other JSON forms gives other keys", () => {
    const first = { amount: 1, toJSON: () => "1.00 EUR" };
    const second = { amount: 1, toJSON: () => "1.00 USD" };

    expect(bodyHash(first)).not.toBe(bodyHash(second));
  });

  it("queryKeyInit with a Date body keys it by its JSON form alone", () => {
    expect(queryKeyInit({ body: new Date(0) }, NO_BASE_URL)).toEqual({
      body: "1970-01-01T00:00:00.000Z",
    });
  });
});

describe("queryKeyInit typed arrays inside a body", () => {
  it("queryKeyInit with typed arrays of the same bytes inside a body gives other keys", () => {
    const uint8 = bodyHash({ a: new Uint8Array([0, 1]) });

    expect(uint8).not.toBe(bodyHash({ a: new Uint16Array([256]) }));
  });

  it("queryKeyInit with a Float32Array inside a body keys it by its numbers", () => {
    const float = new Float32Array([1]);

    expect(bodyHash({ a: float })).not.toBe(bodyHash({ a: new Uint8Array(float.buffer) }));
    expect(bodyHash({ a: float })).toBe(bodyHash({ a: { 0: 1 } }));
  });

  it("queryKeyInit with an ArrayBuffer inside a body keys it as JSON sends it", () => {
    expect(bodyHash({ a: new Uint8Array([1]).buffer })).toBe(bodyHash({ a: {} }));
  });

  it("queryKeyInit with a whole typed array body keys it by its bytes", () => {
    expect(queryKeyInit({ body: new Uint16Array([0x0101]) }, NO_BASE_URL)).toEqual({
      body: [1, 1],
      bodyType: "bytes",
    });
  });
});
