import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fileRefPath,
  isRemoteRef,
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
