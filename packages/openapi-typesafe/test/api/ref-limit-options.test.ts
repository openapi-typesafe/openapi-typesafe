import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { refAccessOf } from "../../src/api/ref-limit-options.js";
import openapiTS from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";

const CWD = pathToFileURL("/work/");

/** A file system with these files only; every other location is a directory or missing. */
const filesAt = (...files: readonly URL[]) => ({
  isFile: (location: URL) => files.some((file) => file.href === location.href),
});

const NO_FILES = filesAt();

// The options as JavaScript may pass them, without the declared types.
const optionsOf = (options: Record<string, unknown>) => options as GeneratorOptions;

describe("refAccessOf", () => {
  it("refAccessOf without limits limits nothing", () => {
    expect(refAccessOf({}, CWD, NO_FILES)).toEqual({});
  });

  it("refAccessOf resolves a relative localRefRoot against the cwd", () => {
    expect(refAccessOf({ localRefRoot: "api" }, CWD, NO_FILES)).toEqual({ localRoot: pathToFileURL("/work/api") });
  });

  it("refAccessOf keeps a file: URL localRefRoot and the remoteRefHosts", () => {
    const localRoot = pathToFileURL("/specs/");

    const access = refAccessOf({ localRefRoot: localRoot, remoteRefHosts: ["a.com", "b.com:8080"] }, CWD, NO_FILES);

    expect(access).toEqual({ localRoot, remoteHosts: ["a.com", "b.com:8080"] });
  });

  it("refAccessOf reads a localRefRoot string with a file: scheme as a URL", () => {
    const specs = pathToFileURL("/specs/");
    expect(refAccessOf({ localRefRoot: specs.href }, CWD, NO_FILES)).toEqual({
      localRoot: specs,
    });
  });

  it("refAccessOf reads a Windows drive path as a path, not a URL", () => {
    const access = refAccessOf({ localRefRoot: "C:specs" }, CWD, NO_FILES);

    expect(access.localRoot?.protocol).toBe("file:");
  });

  it.each([
    [new URL("https://user:secret@example.com/specs/"), "got a https: URL."],
    ["https://user:secret@example.com/specs/", "got a https: URL."],
    ["http://[::1/specs", "got a string that is no valid URL."],
    ["file://server/share/%2F/specs/", "got a file: URL that names no local path."],
    [new URL("file:///a%2Fb/"), "got a file: URL that names no local path."],
    [42, "got a number."],
    [null, "got null."],
    [["specs"], "got a list."],
  ])("refAccessOf with localRefRoot %s fails with OPTION_INVALID", (localRefRoot, got) => {
    const access = () => refAccessOf(optionsOf({ localRefRoot }), CWD, NO_FILES);

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message: `The localRefRoot option must be a directory path or a file: URL; ${got}`,
        details: { option: "localRefRoot" },
      }),
    );
  });

  it("refAccessOf with a relative localRefRoot and an http: cwd fails with OPTION_INVALID", () => {
    const access = () => refAccessOf({ localRefRoot: "specs" }, new URL("http://localhost:1/"), NO_FILES);

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message:
          "The localRefRoot option must be an absolute path or file: URL when cwd is no file: " +
          "URL; got a relative path, and cwd is a http: URL.",
      }),
    );
  });

  it.each(["file:specs/", "file:../specs/", "file:.."])(
    "refAccessOf with the relative file: URL localRefRoot %j and an http: cwd fails with OPTION_INVALID",
    (localRefRoot) => {
      const access = () => refAccessOf({ localRefRoot }, new URL("https://example.com/specs/"), NO_FILES);

      expect(access).toThrow(
        expect.objectContaining({
          code: "OPTION_INVALID",
          message:
            "The localRefRoot option must be an absolute path or file: URL when cwd is no file: " +
            "URL; got a relative file: URL, and cwd is a https: URL.",
        }),
      );
    },
  );

  it("refAccessOf with an absolute file: URL localRefRoot and an http: cwd keeps the URL", () => {
    const root = pathToFileURL(path.resolve("specs"));

    expect(refAccessOf({ localRefRoot: root.href }, new URL("http://localhost:1/"), NO_FILES)).toEqual({
      localRoot: root,
    });
  });

  it("refAccessOf with an absolute localRefRoot and an http: cwd keeps the path", () => {
    const root = pathToFileURL("/specs");

    expect(refAccessOf({ localRefRoot: fileURLToPath(root) }, new URL("http://localhost:1/"), NO_FILES)).toEqual({
      localRoot: root,
    });
  });

  it.each([
    ["spec.yaml", pathToFileURL("/work/spec.yaml")],
    [pathToFileURL("/work/spec.yaml"), pathToFileURL("/work/spec.yaml")],
  ])("refAccessOf with the file %s as localRefRoot fails with OPTION_INVALID", (localRefRoot, file) => {
    const access = () => refAccessOf({ localRefRoot }, CWD, filesAt(file));

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message: "The localRefRoot option must be a directory path or a file: URL; got a file.",
        details: { option: "localRefRoot" },
      }),
    );
  });

  it.each([
    ["spec.yaml/", "got a file."],
    [pathToFileURL("/work/spec.yaml/"), "got a file."],
    [new URL("spec.yaml/", CWD).href, "got a file."],
    ["spec.yaml/specs/", "got a path below a file."],
    ["spec.yaml/specs/v1/", "got a path below a file."],
    [new URL("spec.yaml/specs/", CWD), "got a path below a file."],
  ])("refAccessOf with localRefRoot %s at or below a file fails with OPTION_INVALID", (localRefRoot, got) => {
    const access = () => refAccessOf({ localRefRoot }, CWD, filesAt(pathToFileURL("/work/spec.yaml")));

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message: `The localRefRoot option must be a directory path or a file: URL; ${got}`,
      }),
    );
  });

  it("refAccessOf with a localRefRoot that does not exist yet keeps the root", () => {
    const localRoot = pathToFileURL("/work/new/specs/");

    expect(refAccessOf({ localRefRoot: localRoot }, CWD, NO_FILES)).toEqual({ localRoot });
  });

  it("refAccessOf with a localRefRoot next to a file keeps the root", () => {
    const access = refAccessOf({ localRefRoot: "specs" }, CWD, filesAt(pathToFileURL("/work/spec.yaml")));

    expect(access).toEqual({ localRoot: pathToFileURL("/work/specs") });
  });

  it.each([
    ["a.com", "got a string."],
    [["a.com", 8080], "got a list with a number."],
    [[new URL("https://a.com")], "got a list with a https: URL."],
  ])("refAccessOf with remoteRefHosts %s fails with OPTION_INVALID", (remoteRefHosts, got) => {
    const access = () => refAccessOf(optionsOf({ remoteRefHosts }), CWD, NO_FILES);

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message: `The remoteRefHosts option must be a list of hosts; ${got}`,
        details: { option: "remoteRefHosts" },
      }),
    );
  });
});

describe("openapiTS ref limit options", () => {
  it("openapiTS with a localRefRoot that names no local path rejects with OPTION_INVALID before loading", async () => {
    const source = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: {} };

    const generation = openapiTS(source, { silent: true, localRefRoot: "file:///a%2Fb/" });

    await expect(generation).rejects.toMatchObject({ code: "OPTION_INVALID", details: { option: "localRefRoot" } });
  });

  it("openapiTS with a localRefRoot that is a file on disk rejects with OPTION_INVALID before loading", async () => {
    const source = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: {} };

    const generation = openapiTS(source, { silent: true, localRefRoot: new URL(import.meta.url) });

    await expect(generation).rejects.toMatchObject({ code: "OPTION_INVALID", details: { option: "localRefRoot" } });
  });

  it("openapiTS with a localRefRoot URL of a file with a trailing slash rejects with OPTION_INVALID", async () => {
    const source = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: {} };

    const generation = openapiTS(source, { silent: true, localRefRoot: new URL(`${import.meta.url}/`) });

    await expect(generation).rejects.toMatchObject({ code: "OPTION_INVALID", details: { option: "localRefRoot" } });
  });

  it("openapiTS with remoteRefHosts that is no list rejects with OPTION_INVALID before loading", async () => {
    const source = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: {} };

    const generation = openapiTS(source, optionsOf({ silent: true, remoteRefHosts: "a.com" }));

    await expect(generation).rejects.toMatchObject({ code: "OPTION_INVALID" });
  });
});
