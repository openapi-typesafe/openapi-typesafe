import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isLocalFileUrl } from "../../src/api/local-file-url.js";

describe("isLocalFileUrl", () => {
  it("isLocalFileUrl with a file: URL of a path is true", () => {
    expect(isLocalFileUrl(pathToFileURL("/specs/api.yaml"))).toBe(true);
  });

  it.each(["https://example.com/api.yaml", "s3://bucket/api.yaml"])("isLocalFileUrl with %s is false", (url) => {
    expect(isLocalFileUrl(new URL(url))).toBe(false);
  });

  it("isLocalFileUrl with an encoded slash is false", () => {
    expect(isLocalFileUrl(new URL("file:///a%2Fb.yaml"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("isLocalFileUrl with a host is false outside Windows", () => {
    expect(isLocalFileUrl(new URL("file://specs/a.yaml"))).toBe(false);
  });
});
