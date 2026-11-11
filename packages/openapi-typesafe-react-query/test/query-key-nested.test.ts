import { describe, expect, it } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

const NO_BASE_URL = { baseUrl: "" };
const MULTIPART = { "Content-Type": "multipart/form-data" };

/** The key init of a multipart request with this body. */
function multipartKey(body: unknown): object | undefined {
  return queryKeyInit({ headers: MULTIPART, body }, NO_BASE_URL);
}

describe("queryKeyInit values JSON cannot hold inside a body", () => {
  it("queryKeyInit with a File in an object body keys it by its type, size and name", () => {
    const image = new File(["meow"], "cat.png", { type: "image/png" });

    expect(multipartKey({ image, title: "cat" })).toEqual({
      headers: MULTIPART,
      body: { image: { type: "image/png", size: 4, name: "cat.png" }, title: "cat" },
      bodyType: { image: "Blob" },
    });
  });

  it("queryKeyInit with another File in an object body gives another key", () => {
    const cat = new File(["meow"], "cat.png", { type: "image/png" });
    const dog = new File(["woof woof"], "dog.jpg", { type: "image/jpeg" });

    expect(multipartKey({ image: cat })).not.toEqual(multipartKey({ image: dog }));
  });

  it("queryKeyInit with files in an array and nested bodies names their kinds by place", () => {
    const blob = new Blob(["ab"], { type: "a/b" });
    const bytes = new Uint8Array([7]);

    expect(multipartKey({ files: ["x", blob], meta: { raw: bytes } })).toEqual({
      headers: MULTIPART,
      body: { files: ["x", { type: "a/b", size: 2, name: undefined }], meta: { raw: [7] } },
      bodyType: { files: { 1: "Blob" }, meta: { raw: "bytes" } },
    });
  });

  it("queryKeyInit with a raw value in a body keeps it apart from the same JSON", () => {
    const blob = new Blob(["ab"], { type: "a/b" });
    const json = { file: { type: "a/b", size: 2 } };

    expect(multipartKey({ file: blob })).not.toEqual(multipartKey(json));
    expect(multipartKey(json)).toEqual({ headers: MULTIPART, body: json });
  });

  it("queryKeyInit with an empty JSON body keeps it apart from no body", () => {
    expect(queryKeyInit({ body: {} }, NO_BASE_URL)).toEqual({ body: {} });
    expect(queryKeyInit({ body: [] }, NO_BASE_URL)).toEqual({ body: [] });
    expect(queryKeyInit({ body: { list: [], filter: {} } }, NO_BASE_URL)).toEqual({
      body: { list: [], filter: {} },
    });
  });

  it("queryKeyInit with a Date in a body keeps it for its JSON form", () => {
    const at = new Date(0);

    expect(queryKeyInit({ body: { at } }, NO_BASE_URL)).toEqual({ body: { at } });
  });
});
