import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fileRefPath,
  isRemoteRef,
  redoclyUrlName,
  remoteRefUrl,
  unreadableRefRefusal,
} from "../../../src/adapters/redocly-loader/ref-urls.js";

/** Which `$ref`s are URLs, read by the rule of every location (`hasUrlScheme`). */

const SPECS = path.resolve("specs");
const BASE = path.join(SPECS, "api.yaml");
const PET = path.join(SPECS, "pet.yaml");
const REMOTE_BASE = "https://example.com/api.yaml";
/** A `file:` URL with a host names no local path outside Windows, and an encoded slash none anywhere. */
const NO_LOCAL_PATH = "file:///a%2Fb/pet.yaml";

describe("isRemoteRef", () => {
  it.each([
    ["https://example.com/a.yaml", true],
    ["http://example.com/a.yaml", true],
    [PET, false],
    ["s3://bucket/a.yaml", false],
  ])("isRemoteRef with %s is %s", (ref, expected) => {
    expect(isRemoteRef(ref)).toBe(expected);
  });
});

describe("fileRefPath", () => {
  it.each([
    ["an absolute file: URL", pathToFileURL(PET).href],
    ["a relative file: URL", "file:pet.yaml"],
    ["a file: URL in capitals", `FILE:${pathToFileURL(PET).pathname}`],
  ])("fileRefPath with %s in a local document is the path of its file", (_, ref) => {
    expect(fileRefPath(BASE, ref)).toBe(PET);
  });

  it.each([
    ["a path", "./pet.yaml", BASE],
    ["an http(s) URL", "https://example.com/pet.yaml", BASE],
    ["a file: URL in a remote document", pathToFileURL(PET).href, REMOTE_BASE],
    ["a file: URL in the root", pathToFileURL(PET).href, null],
    ["a file: URL that names no local path", NO_LOCAL_PATH, BASE],
    ["a file: URL that does not parse", "file://[x/pet.yaml", BASE],
  ])("fileRefPath with %s is undefined", (_, ref, base) => {
    expect(fileRefPath(base, ref)).toBeUndefined();
  });
});

describe("unreadableRefRefusal", () => {
  it.each(["s3://bucket/pet.yaml", "FTP://host/pet.yaml", NO_LOCAL_PATH])(
    "unreadableRefRefusal with %s in a local document refuses it as unsupported-url",
    (ref) => {
      expect(unreadableRefRefusal(BASE, ref)).toMatchObject({
        code: "SCHEMA_REF_FORBIDDEN",
        message: `Refused to load ${ref}: it is a URL of no scheme the generator reads (http(s), or file: of a local file)`,
        details: { reason: "unsupported-url" },
      });
    },
  );

  it.each([
    ["a path", "./pet.yaml", BASE],
    ["a path with a colon", "out:v2.yaml", BASE],
    ["a Windows drive path", "C:/specs/pet.yaml", BASE],
    ["an http(s) URL", "HTTPS://example.com/pet.yaml", BASE],
    ["a file: URL of a local file", "file:pet.yaml", BASE],
    ["an s3: URL in a remote document", "s3://bucket/pet.yaml", REMOTE_BASE],
  ])("unreadableRefRefusal with %s is undefined", (_, ref, base) => {
    expect(unreadableRefRefusal(base, ref)).toBeUndefined();
  });
});

describe("remoteRefUrl", () => {
  it.each([
    ["http:127.0.0.1:8080/pet.yaml", BASE, "http://127.0.0.1:8080/pet.yaml"],
    ["https:pet.yaml", BASE, "https://pet.yaml/"],
    ["HTTPS://Example.com/pet.yaml", BASE, "https://example.com/pet.yaml"],
    ["Http://example.com/pet.yaml#/Pet", BASE, "http://example.com/pet.yaml#/Pet"],
    ["http:pet.yaml", "http://example.com/specs/api.yaml", "http://example.com/specs/pet.yaml"],
    ["http:api.yaml", null, "http://api.yaml/"],
  ])(
    "remoteRefUrl with %s in %s is the URL the schema argument names, %s",
    (ref, base, expected) => {
      expect(remoteRefUrl(base, ref)).toBe(expected);
    },
  );

  it.each([
    "./pet.yaml",
    "a:b.yaml",
    "ab:c.yaml",
    "C:/specs/pet.yaml",
    "file:pet.yaml",
    "s3://bucket/pet.yaml",
  ])("remoteRefUrl with %s is undefined", (ref) => {
    expect(remoteRefUrl(BASE, ref)).toBeUndefined();
  });

  // Redocly keeps these as written, and names the document by that text in `redocly lint`.
  it.each([
    "http://LOCALHOST:8080/pet.yaml",
    "http://example.com/x/../pet.yaml",
    "https://example.com/my pet.yaml",
    "http://example.com:80/pet.yaml",
    "http://[::1/pet.yaml",
  ])("remoteRefUrl with %s, which Redocly reads as a URL, keeps it as written", (ref) => {
    expect(remoteRefUrl(BASE, ref)).toBe(ref);
    expect(remoteRefUrl(REMOTE_BASE, ref)).toBe(ref);
  });

  it("remoteRefUrl with an http URL that does not parse throws the URL parser's error", () => {
    expect(() => remoteRefUrl(BASE, "HTTP://[::1/pet.yaml")).toThrow(TypeError);
  });
});

describe("redoclyUrlName", () => {
  // Redocly keeps these as written, and `redocly lint` names the document by that text.
  it.each([
    "http://localhost:8080/my root.yaml",
    "http://LOCALHOST:8080/x/../root.yaml",
    "https://example.com/root.yaml?key=se cret",
  ])("redoclyUrlName with %s, which Redocly reads as a URL, keeps it as written", (written) => {
    expect(redoclyUrlName(written, REMOTE_BASE)).toBe(written);
  });

  it.each([
    ["HTTP://LOCALHOST:8080/x/../root.yaml", undefined, "http://localhost:8080/root.yaml"],
    ["https:root.yaml", undefined, "https://root.yaml/"],
    ["http:root.yaml", "http://example.com/specs/api.yaml", "http://example.com/specs/root.yaml"],
  ])(
    "redoclyUrlName with %s, which Redocly misreads, is its normal form",
    (written, base, expected) => {
      expect(redoclyUrlName(written, base)).toBe(expected);
    },
  );
});
