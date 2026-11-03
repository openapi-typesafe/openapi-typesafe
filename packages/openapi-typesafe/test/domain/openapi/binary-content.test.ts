import { describe, expect, it } from "vitest";
import {
  isRawBinarySchema,
  isTextualMediaType,
} from "../../../src/domain/openapi/binary-content.js";

describe("isRawBinarySchema", () => {
  it("isRawBinarySchema with OpenAPI 3.0 format: binary returns true", () => {
    expect(isRawBinarySchema({ type: "string", format: "binary" })).toBe(true);
  });

  it("isRawBinarySchema with OpenAPI 3.0 format: byte returns false", () => {
    expect(isRawBinarySchema({ type: "string", format: "byte" })).toBe(false);
  });

  it("isRawBinarySchema with a binary contentMediaType returns true", () => {
    expect(isRawBinarySchema({ type: "string", contentMediaType: "image/png" })).toBe(true);
  });

  it("isRawBinarySchema with a contentMediaType and no type returns true", () => {
    expect(isRawBinarySchema({ contentMediaType: "application/octet-stream" })).toBe(true);
  });

  it("isRawBinarySchema with a contentEncoding returns false, also with format: binary", () => {
    const encoded = { contentMediaType: "image/png", contentEncoding: "base64" };

    expect(isRawBinarySchema({ type: "string", ...encoded })).toBe(false);
    expect(isRawBinarySchema({ format: "binary", contentEncoding: "base64url" })).toBe(false);
  });

  it("isRawBinarySchema with a textual contentMediaType returns false", () => {
    expect(isRawBinarySchema({ type: "string", contentMediaType: "application/json" })).toBe(false);
  });

  it("isRawBinarySchema with neither format nor contentMediaType returns false", () => {
    expect(isRawBinarySchema({ type: "string" })).toBe(false);
    expect(isRawBinarySchema({ type: "string", format: "date-time" })).toBe(false);
  });
});

describe("isTextualMediaType", () => {
  it.each([
    "text/plain",
    "text/csv",
    "TEXT/HTML; charset=utf-8",
    "application/json",
    "application/problem+json",
    "application/xml",
    "image/svg+xml",
    "application/yaml",
    "application/vnd.oai.openapi+yaml",
    "application/x-yaml",
    "application/x-ndjson",
    "application/jsonl",
    "application/json-seq",
    "application/javascript",
    "application/x-www-form-urlencoded",
    "application/graphql",
    "application/sql",
  ])("isTextualMediaType with %s returns true", (mediaType) => {
    expect(isTextualMediaType(mediaType)).toBe(true);
  });

  it.each([
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "image/png",
    "image/*",
    "audio/mpeg",
    "video/mp4",
    "application/vnd.ms-excel",
    "*/*",
    "png",
  ])("isTextualMediaType with %s returns false", (mediaType) => {
    expect(isTextualMediaType(mediaType)).toBe(false);
  });
});
