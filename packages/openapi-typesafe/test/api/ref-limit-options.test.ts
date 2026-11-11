import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { refAccessOf } from "../../src/api/ref-limit-options.js";
import openapiTS from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";

const CWD = pathToFileURL("/work/");

// The options as JavaScript may pass them, without the declared types.
const optionsOf = (options: Record<string, unknown>) => options as GeneratorOptions;

describe("refAccessOf", () => {
  it("refAccessOf without limits limits nothing", () => {
    expect(refAccessOf({}, CWD)).toEqual({});
  });

  it("refAccessOf resolves a relative localRefRoot against the cwd", () => {
    expect(refAccessOf({ localRefRoot: "api" }, CWD)).toEqual({ localRoot: pathToFileURL("/work/api") });
  });

  it("refAccessOf keeps a file: URL localRefRoot and the remoteRefHosts", () => {
    const localRoot = pathToFileURL("/specs/");

    const access = refAccessOf({ localRefRoot: localRoot, remoteRefHosts: ["a.com", "b.com:8080"] }, CWD);

    expect(access).toEqual({ localRoot, remoteHosts: ["a.com", "b.com:8080"] });
  });

  it("refAccessOf reads a localRefRoot string with a file: scheme as a URL", () => {
    const specs = pathToFileURL("/specs/");
    expect(refAccessOf({ localRefRoot: specs.href }, CWD)).toEqual({
      localRoot: specs,
    });
  });

  it("refAccessOf reads a Windows drive path as a path, not a URL", () => {
    const access = refAccessOf({ localRefRoot: "C:specs" }, CWD);

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
    const access = () => refAccessOf(optionsOf({ localRefRoot }), CWD);

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message: `The localRefRoot option must be a directory path or a file: URL; ${got}`,
        details: { option: "localRefRoot" },
      }),
    );
  });

  it("refAccessOf with a relative localRefRoot and an http: cwd fails with OPTION_INVALID", () => {
    const access = () => refAccessOf({ localRefRoot: "specs" }, new URL("http://localhost:1/"));

    expect(access).toThrow(
      expect.objectContaining({
        code: "OPTION_INVALID",
        message:
          "The localRefRoot option must be an absolute path or a file: URL when cwd is no file: " +
          "URL; got a relative path, and cwd is a http: URL.",
      }),
    );
  });

  it("refAccessOf with an absolute localRefRoot and an http: cwd keeps the path", () => {
    const root = pathToFileURL("/specs");

    expect(refAccessOf({ localRefRoot: fileURLToPath(root) }, new URL("http://localhost:1/"))).toEqual({
      localRoot: root,
    });
  });

  it.each([
    ["a.com", "got a string."],
    [["a.com", 8080], "got a list with a number."],
    [[new URL("https://a.com")], "got a list with a https: URL."],
  ])("refAccessOf with remoteRefHosts %s fails with OPTION_INVALID", (remoteRefHosts, got) => {
    const access = () => refAccessOf(optionsOf({ remoteRefHosts }), CWD);

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

  it("openapiTS with remoteRefHosts that is no list rejects with OPTION_INVALID before loading", async () => {
    const source = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: {} };

    const generation = openapiTS(source, optionsOf({ silent: true, remoteRefHosts: "a.com" }));

    await expect(generation).rejects.toMatchObject({ code: "OPTION_INVALID" });
  });
});
