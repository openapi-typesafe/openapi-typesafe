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
    const params = new URLSearchParams("a=1");

    expect(multipartKey({ files: ["x", blob], meta: { params } })).toEqual({
      headers: MULTIPART,
      body: { files: ["x", { type: "a/b", size: 2, name: undefined }], meta: { params: "a=1" } },
      bodyType: { files: { 1: "Blob" }, meta: { params: "URLSearchParams" } },
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

  it("queryKeyInit with a Date in a body keys it by its JSON form", () => {
    const at = new Date(0);

    expect(queryKeyInit({ body: { at } }, NO_BASE_URL)).toEqual({
      body: { at: "1970-01-01T00:00:00.000Z" },
    });
  });
});

describe("queryKeyInit params and headers that send nothing", () => {
  it("queryKeyInit with only undefined parameters gives the key of no init", () => {
    expect(queryKeyInit({ params: { query: { cursor: undefined } } }, NO_BASE_URL)).toBeUndefined();
    expect(queryKeyInit({ params: { query: undefined } }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit with empty params records gives the key of no init", () => {
    expect(queryKeyInit({ params: {} }, NO_BASE_URL)).toBeUndefined();
    expect(queryKeyInit({ params: { query: {}, header: {} } }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit with only undefined headers gives the key of no init", () => {
    expect(queryKeyInit({ headers: { "X-Tenant": undefined } }, NO_BASE_URL)).toBeUndefined();
    expect(queryKeyInit({ headers: new Headers() }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit leaves out undefined parameters next to set ones", () => {
    const init = { params: { path: { id: 1 }, query: { cursor: undefined, limit: 5 } } };

    expect(queryKeyInit(init, NO_BASE_URL)).toEqual({
      params: { path: { id: 1 }, query: { limit: 5 } },
    });
  });

  it("queryKeyInit keeps a null params record as it is", () => {
    expect(queryKeyInit({ params: { query: null } }, NO_BASE_URL)).toEqual({
      params: { query: null },
    });
  });

  it("queryKeyInit keeps null, empty array and empty object parameter values", () => {
    const params = { query: { tag: null, ids: [], filter: {} }, header: { "X-A": null } };

    expect(queryKeyInit({ params, headers: { "X-B": null } }, NO_BASE_URL)).toEqual({
      params,
      headers: { "X-B": null },
    });
  });
});
