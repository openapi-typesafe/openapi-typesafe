import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { locationInText, parseUrlLocation } from "../../src/domain/location-text.js";

const BASE = pathToFileURL(`${path.resolve("work")}${path.sep}`);

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
    expect(parseUrlLocation("file:api.yaml", BASE)?.href).toBe(new URL("api.yaml", BASE).href);
  });

  it("parseUrlLocation with a URL that does not parse is undefined", () => {
    expect(parseUrlLocation("http://[::1/x", BASE)).toBeUndefined();
  });
});
