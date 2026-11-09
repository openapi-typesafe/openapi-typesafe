import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  claimIdentity,
  missingDirectories,
} from "../../../src/adapters/node-file-system/file-claims.js";
import { createNodeFileSystem } from "../../../src/adapters/node-file-system/node-file-system.js";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-fs-"));

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** Longer than the 255 characters that every common file system allows in one name. */
const FILE_NAME_TOO_LONG = 300;

describe("createNodeFileSystem", () => {
  it("writeText creates the directory and readText reads the file back", () => {
    const files = createNodeFileSystem();
    const file = pathToFileURL(path.join(workDir, "nested/dir/types.ts"));

    files.writeText(file, "export {};\n");

    expect(files.readText(file)).toBe("export {};\n");
  });

  it("readText of a missing file fails with OUTPUT_READ_FAILED and the path", () => {
    const file = path.join(workDir, "missing.ts");

    expect(() => createNodeFileSystem().readText(pathToFileURL(file))).toThrow(
      expect.objectContaining({
        code: "OUTPUT_READ_FAILED",
        message: expect.stringContaining(`Cannot read ${file}: ENOENT`),
        details: { file },
      }),
    );
  });

  it("isSameFile of one path, also spelled with `..`, is true", () => {
    const file = path.join(workDir, "same.yaml");

    const isSame = createNodeFileSystem().isSameFile(
      pathToFileURL(file),
      pathToFileURL(path.join(workDir, "nested", "..", "same.yaml")),
    );

    expect(isSame).toBe(true);
  });

  it("isSameFile of a symbolic link and its target is true", () => {
    const target = path.join(workDir, "target.yaml");
    const link = path.join(workDir, "link.yaml");
    fs.writeFileSync(target, "openapi: 3.1.0");
    fs.symlinkSync(target, link);

    expect(createNodeFileSystem().isSameFile(pathToFileURL(link), pathToFileURL(target))).toBe(
      true,
    );
  });

  it("isSameFile of a hard link and the file is true", () => {
    const original = path.join(workDir, "original.yaml");
    const hardLink = path.join(workDir, "hard-link.yaml");
    fs.writeFileSync(original, "openapi: 3.1.0");
    fs.linkSync(original, hardLink);

    expect(
      createNodeFileSystem().isSameFile(pathToFileURL(hardLink), pathToFileURL(original)),
    ).toBe(true);
  });

  it("isSameFile in another letter case is true exactly when the file system ignores case", () => {
    const lower = path.join(workDir, "case.yaml");
    const upper = path.join(workDir, "CASE.yaml");
    fs.writeFileSync(lower, "openapi: 3.1.0");

    const isSame = createNodeFileSystem().isSameFile(pathToFileURL(upper), pathToFileURL(lower));

    expect(isSame).toBe(fs.existsSync(upper));
  });

  it("isSameFile of two missing files in another letter case follows the file system (G1)", () => {
    const probe = path.join(workDir, "probe.yaml");
    fs.writeFileSync(probe, "");
    const ignoresCase = fs.existsSync(path.join(workDir, "PROBE.yaml"));
    const lower = pathToFileURL(path.join(workDir, "gen", "types.ts"));
    const upper = pathToFileURL(path.join(workDir, "gen", "Types.ts"));

    expect(createNodeFileSystem().isSameFile(lower, upper)).toBe(ignoresCase);
  });

  it("isSameFile of a missing file through a linked directory and in the target is true (G2)", () => {
    const real = path.join(workDir, "real-dir");
    const link = path.join(workDir, "link-dir");
    fs.mkdirSync(real);
    fs.symlinkSync(real, link, "dir");

    const isSame = createNodeFileSystem().isSameFile(
      pathToFileURL(path.join(link, "out", "types.ts")),
      pathToFileURL(path.join(real, "out", "types.ts")),
    );

    expect(isSame).toBe(true);
  });

  it("isSameFile of two files, or of a missing or unreadable one, is false", () => {
    const first = path.join(workDir, "first.yaml");
    const second = path.join(workDir, "second.yaml");
    fs.writeFileSync(first, "a");
    fs.writeFileSync(second, "b");
    const files = createNodeFileSystem();

    expect(files.isSameFile(pathToFileURL(first), pathToFileURL(second))).toBe(false);
    expect(
      files.isSameFile(pathToFileURL(path.join(workDir, "none.ts")), pathToFileURL(first)),
    ).toBe(false);
    expect(
      files.isSameFile(pathToFileURL(first), pathToFileURL(path.join(first, "under.ts"))),
    ).toBe(false);
  });

  it("isDirectory is true for a directory only", () => {
    const files = createNodeFileSystem();
    const file = path.join(workDir, "plain.ts");
    fs.writeFileSync(file, "");

    expect(files.isDirectory(pathToFileURL(workDir))).toBe(true);
    expect(files.isDirectory(pathToFileURL(file))).toBe(false);
    expect(files.isDirectory(pathToFileURL(path.join(workDir, "absent")))).toBe(false);
  });

  it("readText and writeText of a URL that is no local file fail with a typed error (G4)", () => {
    const files = createNodeFileSystem();
    const remote = new URL("https://example.invalid/out.ts");

    expect(() => files.readText(remote)).toThrow(
      expect.objectContaining({ code: "OUTPUT_READ_FAILED", details: { file: remote.href } }),
    );
    expect(() => files.writeText(remote, "")).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED", details: { file: remote.href } }),
    );
  });

  it("writeText that fails after creating directories removes them", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "write-"));
    const tooLong = `${"x".repeat(FILE_NAME_TOO_LONG)}.ts`;
    const file = pathToFileURL(path.join(parent, "new1", "new2", tooLong));

    expect(() => createNodeFileSystem().writeText(file, "types")).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
    );
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("writeText through a link to a missing directory writes into its target", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "write-"));
    fs.symlinkSync(path.join(parent, "missing-dir"), path.join(parent, "link"), "dir");

    createNodeFileSystem().writeText(pathToFileURL(path.join(parent, "link", "x.ts")), "types");

    expect(fs.readFileSync(path.join(parent, "missing-dir", "x.ts"), "utf8")).toBe("types");
  });

  it("writeText into a path under a file fails with OUTPUT_WRITE_FAILED", () => {
    const blocker = path.join(workDir, "blocker");
    fs.writeFileSync(blocker, "");
    const file = pathToFileURL(path.join(blocker, "types.ts"));

    expect(() => createNodeFileSystem().writeText(file, "")).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
    );
  });
});

/** Whether the file system of `workDir` stores `second` as the file it stores `first` as. */
function isOneFileOnDisk(first: string, second: string): boolean {
  const probeDir = fs.mkdtempSync(path.join(workDir, "probe-"));
  fs.mkdirSync(path.dirname(path.join(probeDir, first)), { recursive: true });
  fs.writeFileSync(path.join(probeDir, first), "");
  return fs.existsSync(path.join(probeDir, second));
}

describe("createNodeFileSystem: claimFile (ADR-043, decision 1)", () => {
  it("claimFile of a missing file creates it empty and release removes it and its new directories", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    const file = path.join(parent, "new", "dir", "types.ts");

    const claim = createNodeFileSystem().claimFile(pathToFileURL(file));

    expect(fs.readFileSync(file, "utf8")).toBe("");
    claim.release();
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("claimFile of an existing file keeps its content, also after release", () => {
    const file = path.join(fs.mkdtempSync(path.join(workDir, "claim-")), "types.ts");
    fs.writeFileSync(file, "old types");

    createNodeFileSystem().claimFile(pathToFileURL(file)).release();

    expect(fs.readFileSync(file, "utf8")).toBe("old types");
  });

  it("claimFile of two paths gives one identity exactly when they are one file", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    const files = createNodeFileSystem();
    const claim = (name: string) => files.claimFile(pathToFileURL(path.join(parent, name)));

    expect(claim("a.ts").identity).toBe(claim("a.ts").identity);
    expect(claim("a.ts").identity).not.toBe(claim("b.ts").identity);
  });

  it.each([
    ["NFC and NFD names", "caf\u00e9.ts", "cafe\u0301.ts"],
    ["ß and SS", "straße.ts", "STRASSE.ts"],
    ["names without letters to probe", "_/Types.ts", "_/types.ts"],
  ])(
    "claimFile of %s gives one identity exactly when the file system stores one file",
    (_case, first, second) => {
      const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
      fs.mkdirSync(path.join(parent, "_"));
      const isOneFile = isOneFileOnDisk(first, second);
      const files = createNodeFileSystem();

      const firstClaim = files.claimFile(pathToFileURL(path.join(parent, first)));
      const secondClaim = files.claimFile(pathToFileURL(path.join(parent, second)));

      expect(firstClaim.identity === secondClaim.identity).toBe(isOneFile);
    },
  );

  it("claimFile through a link to a missing file creates the target, and release removes it", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    fs.symlinkSync(path.join(parent, "missing.ts"), path.join(parent, "out.ts"));
    const files = createNodeFileSystem();

    const claim = files.claimFile(pathToFileURL(path.join(parent, "out.ts")));

    expect(claim.identity).toBe(
      files.claimFile(pathToFileURL(path.join(parent, "missing.ts"))).identity,
    );
    claim.release();
    expect(fs.existsSync(path.join(parent, "missing.ts"))).toBe(false);
  });

  it("claimFile through a link to a missing directory creates the target, and release removes it", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    fs.symlinkSync(path.join(parent, "missing-dir"), path.join(parent, "link"), "dir");

    const claim = createNodeFileSystem().claimFile(
      pathToFileURL(path.join(parent, "link", "x.ts")),
    );

    expect(fs.existsSync(path.join(parent, "missing-dir", "x.ts"))).toBe(true);
    claim.release();
    expect(fs.readdirSync(parent)).toEqual(["link"]);
  });

  it("claimFile that fails after creating directories removes them", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    const tooLong = `${"x".repeat(FILE_NAME_TOO_LONG)}.ts`;
    const file = pathToFileURL(path.join(parent, "new1", "new2", tooLong));

    expect(() => createNodeFileSystem().claimFile(file)).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
    );
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("release keeps a new directory that another file was put in since", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    const claim = createNodeFileSystem().claimFile(pathToFileURL(path.join(parent, "g", "a.ts")));
    fs.writeFileSync(path.join(parent, "g", "other.ts"), "");

    claim.release();

    expect(fs.readdirSync(path.join(parent, "g"))).toEqual(["other.ts"]);
  });

  it("release of a new directory that was removed since removes its new parents", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    const claim = createNodeFileSystem().claimFile(
      pathToFileURL(path.join(parent, "g", "h", "a.ts")),
    );
    fs.rmSync(path.join(parent, "g", "h"), { recursive: true });

    claim.release();

    expect(fs.readdirSync(parent)).toEqual([]);
  });

  // Windows has no write bit on directories, and root may remove entries anyway.
  const hasDirectoryPermissions = process.platform !== "win32" && process.getuid?.() !== 0;

  it.runIf(hasDirectoryPermissions)(
    "release of a new directory it may not remove fails with OUTPUT_WRITE_FAILED",
    () => {
      const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
      const claim = createNodeFileSystem().claimFile(
        pathToFileURL(path.join(parent, "g", "h", "a.ts")),
      );
      const directory = path.join(parent, "g");
      const { mode } = fs.statSync(directory);
      const readAndSearchOnly = 0o555;
      fs.chmodSync(directory, readAndSearchOnly);

      try {
        expect(() => claim.release()).toThrow(
          expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
        );
      } finally {
        fs.chmodSync(directory, mode);
      }
    },
  );

  it("claimFile under a file, and release of a removed directory, fail with OUTPUT_WRITE_FAILED", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    fs.writeFileSync(path.join(parent, "blocker"), "");
    const files = createNodeFileSystem();
    const claim = files.claimFile(pathToFileURL(path.join(parent, "g", "a.ts")));
    fs.rmSync(path.join(parent, "g"), { recursive: true });
    fs.writeFileSync(path.join(parent, "g"), "");

    expect(() => files.claimFile(pathToFileURL(path.join(parent, "blocker", "a.ts")))).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
    );
    expect(() => claim.release()).toThrow(expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }));
  });

  it("isSameFile of a file through a link to a missing directory and in that directory is true", () => {
    const parent = fs.mkdtempSync(path.join(workDir, "claim-"));
    fs.symlinkSync(path.join(parent, "missing-dir"), path.join(parent, "link"), "dir");

    const isSame = createNodeFileSystem().isSameFile(
      pathToFileURL(path.join(parent, "link", "x.ts")),
      pathToFileURL(path.join(parent, "missing-dir", "x.ts")),
    );

    expect(isSame).toBe(true);
  });
});

describe("claimIdentity and missingDirectories", () => {
  it("claimIdentity is the file number, or the stored path when the file number is 0", () => {
    expect(claimIdentity({ device: 1n, file: 7n }, () => "/x")).toBe("1:7");
    expect(claimIdentity({ device: 1n, file: 0n }, () => "/x")).toBe("path:/x");
  });

  it("missingDirectories lists the directories up to the first that exists, deepest first", () => {
    const top = path.join(workDir, "a");
    const isWorkDir = (directory: string) => directory === workDir;

    expect(missingDirectories(path.join(top, "b"), isWorkDir)).toEqual([path.join(top, "b"), top]);
    expect(missingDirectories(workDir, isWorkDir)).toEqual([]);
  });

  it("missingDirectories stops at the root when nothing exists", () => {
    const root = path.parse(workDir).root;

    expect(missingDirectories(path.join(root, "a"), () => false)).toEqual([
      path.join(root, "a"),
      root,
    ]);
  });
});
