import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { locationInText, parseUrlLocation } from "../../src/domain/location-text.js";

const BASE = pathToFileURL(`${path.resolve("work")}${path.sep}`);
const HTTPS_BASE = new URL("https://example.com/specs/");

describe("locationInText", () => {
  it.each([
    ["file:api.yaml", "file:api.yaml"],
    ["https://example.com/a.yaml", "https://example.com/a.yaml"],
    ["  https://example.com/a.yaml\n", "https://example.com/a.yaml"],
    ["s3://bucket/api.yaml", "s3://bucket/api.yaml"],
    ["http://[::1/x", "http://[::1/x"],
  ])("locationInText with %j is the location %j", (text, location) => {
    expect(locationInText(text)).toBe(location);
  });

  it.each([
    "file: api.yaml",
    "http://example.com/a: b\nopenapi: 3.1.0",
    "file:api.yaml # a comment",
    "https://example.com/a.yaml\nopenapi: 3.1.0",
    "openapi: 3.1.0",
    "openapi:3.1.0",
    "./api.yaml",
    "C:\\specs\\api.yaml",
  ])("locationInText with the document text %j is undefined", (text) => {
    expect(locationInText(text)).toBeUndefined();
  });
});

describe("parseUrlLocation", () => {
  it("parseUrlLocation with a relative file: URL resolves it against the base", () => {
    expect(parseUrlLocation("file:api.yaml", BASE)).toEqual({
      kind: "url",
      url: new URL("api.yaml", BASE),
    });
  });

  it("parseUrlLocation with a URL that does not parse is unparsed", () => {
    expect(parseUrlLocation("http://[::1/x", BASE)).toEqual({ kind: "unparsed" });
  });

  it.each(["file:api.yaml", "file:./specs/api.yaml", "file:", "FILE:api.yaml"])(
    "parseUrlLocation with the relative %j and an https: base is relative-file",
    (location) => {
      expect(parseUrlLocation(location, HTTPS_BASE)).toEqual({ kind: "relative-file" });
    },
  );

  it.each([
    ["file:///specs/api.yaml", "file:///specs/api.yaml"],
    ["file:/specs/api.yaml", "file:///specs/api.yaml"],
    ["https://example.com/api.yaml", "https://example.com/api.yaml"],
    ["api.yaml", "https://example.com/specs/api.yaml"],
  ])("parseUrlLocation with %j and an https: base is the URL %j", (location, href) => {
    expect(parseUrlLocation(location, HTTPS_BASE)).toEqual({ kind: "url", url: new URL(href) });
  });
});
