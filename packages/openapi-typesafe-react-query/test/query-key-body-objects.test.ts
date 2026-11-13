import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

/**
 * Bodies that are not object literals, and React Native's FormData. The fetch client sends the own
 * enumerable members of any object body, so the key holds them by the same rule.
 */

const NO_BASE_URL = { baseUrl: "" };
const MULTIPART = { "Content-Type": "multipart/form-data" };
const CAT = new File(["meow"], "cat.png", { type: "image/png" });
const DOG = new File(["woof woof"], "dog.jpg", { type: "image/jpeg" });
const CAT_KEY = { type: "image/png", size: 4, name: "cat.png" };

/** A multipart body written as a class, as a DTO is. */
class MatchForm {
  readonly image: File;
  readonly note: string;

  constructor(image: File, note = "") {
    this.image = image;
    this.note = note;
  }

  /** A method on the prototype is no own member, so neither JSON nor the client sends it. */
  summary(): string {
    return this.note;
  }
}

/** The body part of the key init of a multipart request with this body. */
function multipartBodyKey(body: unknown): unknown {
  const { headers: _headers, ...key } = queryKeyInit({ headers: MULTIPART, body }, NO_BASE_URL) as {
    headers: unknown;
  };
  return key;
}

describe("queryKeyInit object bodies that are not object literals", () => {
  it("queryKeyInit with a class instance body keys its File by content", () => {
    expect(multipartBodyKey(new MatchForm(CAT, "a"))).toEqual({
      body: { image: CAT_KEY, note: "a" },
      bodyType: { image: "Blob" },
    });
  });

  it("queryKeyInit with class instance bodies of other files gives other keys", () => {
    expect(multipartBodyKey(new MatchForm(CAT))).not.toEqual(multipartBodyKey(new MatchForm(DOG)));
  });

  it("queryKeyInit with an Object.create body keys only its own members", () => {
    const body = Object.assign(Object.create({ inherited: DOG }), { image: CAT });

    expect(multipartBodyKey(body)).toEqual({
      body: { image: CAT_KEY },
      bodyType: { image: "Blob" },
    });
  });

  it("queryKeyInit with a body object of another realm keys its File by content", () => {
    const body = runInNewContext("({ note: 'a' })") as Record<string, unknown>;
    body.image = CAT;

    expect(multipartBodyKey(body)).toEqual({
      body: { note: "a", image: CAT_KEY },
      bodyType: { image: "Blob" },
    });
  });

  it("queryKeyInit with an object of its own JSON form keeps it as it is", () => {
    const at = new Date(0);
    const money = { amount: 1, toJSON: () => "1.00 EUR" };

    expect(queryKeyInit({ body: { at, money } }, NO_BASE_URL)).toEqual({ body: { at, money } });
    expect(queryKeyInit({ body: at }, NO_BASE_URL)).toEqual({ body: at });
  });
});

/** One part of React Native's FormData as its `getParts` writes it. */
type NativePart = { fieldName: string; headers: object; [member: string]: unknown };

/** React Native's FormData: `append` and `getParts`, no `entries`. */
class NativeFormData {
  private readonly parts: [string, unknown][] = [];

  append(name: string, value: unknown): void {
    this.parts.push([name, value]);
  }

  getParts(): NativePart[] {
    return this.parts.map(([fieldName, value]) => {
      const headers = { "content-disposition": `form-data; name="${fieldName}"` };
      return typeof value === "object" && value !== null
        ? { ...value, headers, fieldName }
        : { string: String(value), headers, fieldName };
    });
  }
}

/** A React Native FormData with a note and an image file of this name, as a FormData body. */
function nativeForm(name: string): FormData {
  const form = new NativeFormData();
  form.append("note", name);
  form.append("image", { uri: `file:///photos/${name}.jpg`, name: `${name}.jpg`, type: "a/b" });
  return form as unknown as FormData;
}

describe("queryKeyInit React Native FormData", () => {
  // On a device the global FormData is React Native's class, which has no type tag.
  beforeEach(() => {
    vi.stubGlobal("FormData", NativeFormData);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queryKeyInit with a React Native FormData keys it by the parts it sends", () => {
    const form = nativeForm("cat");

    expect(queryKeyInit({ body: form }, NO_BASE_URL)).toEqual({
      body: (form as unknown as NativeFormData).getParts(),
      bodyType: "FormData",
    });
  });

  it("queryKeyInit with React Native FormData of other files gives other keys", () => {
    expect(queryKeyInit({ body: nativeForm("cat") }, NO_BASE_URL)).not.toEqual(
      queryKeyInit({ body: nativeForm("dog") }, NO_BASE_URL),
    );
  });
});
