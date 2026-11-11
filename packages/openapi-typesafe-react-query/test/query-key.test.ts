import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

const BASE_URL = "https://api.example.com";
const WITH_BASE_URL = { baseUrl: BASE_URL };
const NO_BASE_URL = { baseUrl: "" };

describe("queryKeyInit", () => {
  it("queryKeyInit writes Headers and header pairs as the names and values they send", () => {
    const headers = new Headers({ "X-Tenant": "a" });
    headers.append("Accept", "a/b");
    headers.append("accept", "c/d");

    expect(queryKeyInit({ headers }, NO_BASE_URL)).toEqual({
      headers: { accept: "a/b, c/d", "x-tenant": "a" },
    });
    expect(
      queryKeyInit(
        {
          headers: [
            ["X-A", "1"],
            ["x-a", "2"],
          ],
        },
        NO_BASE_URL,
      ),
    ).toEqual({
      headers: { "x-a": "1, 2" },
    });
  });

  it("queryKeyInit keeps a plain headers object, whose null and array values mean more", () => {
    const headers = { "X-A": ["1", "2"], "X-B": null };

    expect(queryKeyInit({ headers }, NO_BASE_URL)).toEqual({ headers });
  });

  it("queryKeyInit adds the client's base URL unless the init has its own", () => {
    expect(queryKeyInit(undefined, WITH_BASE_URL)).toEqual({ baseUrl: BASE_URL });
    expect(queryKeyInit({ baseUrl: "https://other.example" }, WITH_BASE_URL)).toEqual({
      baseUrl: "https://other.example",
    });
  });

  it("queryKeyInit leaves out the signal and gives no init without an init and a base URL", () => {
    expect(
      queryKeyInit({ signal: new AbortController().signal, params: { a: 1 } }, NO_BASE_URL),
    ).toEqual({ params: { a: 1 } });
    expect(queryKeyInit(undefined, NO_BASE_URL)).toBeUndefined();
    expect(queryKeyInit({}, NO_BASE_URL)).toBeUndefined();
    expect(queryKeyInit({ signal: new AbortController().signal }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit reads invalid header pairs without throwing", () => {
    expect(
      queryKeyInit(
        {
          headers: [
            ["a\nb", "1"],
            ["x", "c\nd"],
          ],
        },
        NO_BASE_URL,
      ),
    ).toEqual({
      headers: { "a\nb": "1", x: "c\nd" },
    });
  });

  it("queryKeyInit writes the client's key scope in place of its base URL", () => {
    expect(queryKeyInit(undefined, { baseUrl: BASE_URL, keyScope: "billing" })).toEqual({
      keyScope: "billing",
    });
    expect(queryKeyInit(undefined, { baseUrl: "", keyScope: "" })).toEqual({ keyScope: "" });
  });
});

describe("queryKeyInit bodies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queryKeyInit writes a body of a platform class without a type tag by its kind", () => {
    /** React Native's URLSearchParams, which has no type tag. */
    class NativeSearchParams {
      toString() {
        return "q=cats";
      }
    }
    vi.stubGlobal("URLSearchParams", NativeSearchParams);

    expect(queryKeyInit({ body: new NativeSearchParams() }, NO_BASE_URL)).toEqual({
      body: "q=cats",
      bodyType: "URLSearchParams",
    });
  });

  it("queryKeyInit writes a URLSearchParams body as its text", () => {
    expect(queryKeyInit({ body: new URLSearchParams({ q: "dogs" }) }, NO_BASE_URL)).toEqual({
      body: "q=dogs",
      bodyType: "URLSearchParams",
    });
  });

  it("queryKeyInit writes a FormData body as its fields, a file by its type and size", () => {
    const form = new FormData();
    form.append("q", "dogs");
    form.append("file", new File(["abc"], "a.txt", { type: "text/plain", lastModified: 5 }));

    expect(queryKeyInit({ body: form }, NO_BASE_URL)).toEqual({
      body: [
        ["q", "dogs"],
        ["file", { type: "text/plain", size: 3, name: "a.txt" }],
      ],
      bodyType: "FormData",
    });
  });

  it("queryKeyInit writes a Blob body by its type and size", () => {
    expect(queryKeyInit({ body: new Blob(["abcd"], { type: "a/b" }) }, NO_BASE_URL)).toEqual({
      body: { type: "a/b", size: 4, name: undefined },
      bodyType: "Blob",
    });
  });

  it("queryKeyInit writes an ArrayBuffer or a typed array body as its bytes", () => {
    const bytes = new Uint8Array([9, 1, 2, 3]);

    expect(queryKeyInit({ body: bytes.buffer }, NO_BASE_URL)).toEqual({
      body: [9, 1, 2, 3],
      bodyType: "bytes",
    });
    expect(queryKeyInit({ body: bytes.subarray(1, 3) }, NO_BASE_URL)).toEqual({
      body: [1, 2],
      bodyType: "bytes",
    });
  });

  it("queryKeyInit keeps a JSON body and a FormData without entries as they are or empty", () => {
    const body = { q: "dogs" };
    const nativeForm = Object.assign(Object.create(FormData.prototype), { entries: undefined });

    expect(queryKeyInit({ body }, NO_BASE_URL)).toEqual({ body });
    expect(queryKeyInit({ body: "q=dogs" }, NO_BASE_URL)).toEqual({ body: "q=dogs" });
    expect(queryKeyInit({ body: nativeForm }, NO_BASE_URL)).toEqual({
      body: [],
      bodyType: "FormData",
    });
  });

  it("queryKeyInit keys a File by its name and not its date", () => {
    const first = new File(["abc"], "a.txt", { lastModified: 1 });
    const second = new File(["xyz"], "a.txt", { lastModified: 2 });

    expect(queryKeyInit({ body: first }, NO_BASE_URL)).toEqual(
      queryKeyInit({ body: second }, NO_BASE_URL),
    );
  });

  it("queryKeyInit keeps bytes apart from a JSON body of the same shape", () => {
    const bytes = new Uint8Array([104, 105]);
    const json = { bytes: [104, 105] };

    expect(queryKeyInit({ body: bytes }, NO_BASE_URL)).not.toEqual(
      queryKeyInit({ body: json }, NO_BASE_URL),
    );
    expect(queryKeyInit({ body: [104, 105] }, NO_BASE_URL)).toEqual({ body: [104, 105] });
  });
});

describe("queryKeyInit undefined fields", () => {
  it("queryKeyInit leaves out an init of only undefined fields", () => {
    expect(queryKeyInit({ headers: undefined, body: undefined }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit leaves out undefined fields next to set ones", () => {
    expect(queryKeyInit({ headers: undefined, params: { a: 1 } }, NO_BASE_URL)).toEqual({
      params: { a: 1 },
    });
  });
});
