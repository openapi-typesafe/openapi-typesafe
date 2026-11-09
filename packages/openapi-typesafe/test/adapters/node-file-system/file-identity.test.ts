import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type FileNumber,
  fileIdentityKey,
  isSameFileNumber,
  type PathQueries,
} from "../../../src/adapters/node-file-system/file-identity.js";

/** Platform paths written POSIX style, as the CLI fakes do. */
function at(posixPath: string): string {
  return path.resolve(posixPath);
}

/**
 * Files and directories by path, on a file system that ignores letter case or not. `links` maps a
 * link path to its target as written in the link: a relative target is read from the real
 * directory of the link, as a symbolic link's is.
 */
class InMemoryTree implements PathQueries {
  readonly #paths: string[];
  readonly #ignoresCase: boolean;
  readonly #links: ReadonlyMap<string, string>;

  constructor(paths: readonly string[], ignoresCase: boolean, links = new Map<string, string>()) {
    const withAncestors = new Set<string>();
    for (const entry of [...links.keys(), ...paths].map(at)) {
      for (let current = entry; ; current = path.dirname(current)) {
        withAncestors.add(current);
        if (path.dirname(current) === current) {
          break;
        }
      }
    }
    this.#paths = [...withAncestors];
    this.#ignoresCase = ignoresCase;
    this.#links = new Map([...links].map(([link, target]) => [at(link), target]));
  }

  #stored(filePath: string): string | undefined {
    const same = (stored: string) =>
      this.#ignoresCase ? stored.toLowerCase() === filePath.toLowerCase() : stored === filePath;
    return this.#paths.find(same);
  }

  #resolve(filePath: string): string | undefined {
    const parent = path.dirname(filePath);
    const base =
      parent === filePath
        ? filePath
        : path.join(this.#resolve(parent) ?? parent, path.basename(filePath));
    const stored = this.#stored(base);
    const target = stored === undefined ? undefined : this.#links.get(stored);
    return stored === undefined || target === undefined
      ? stored
      : this.#stored(path.resolve(path.dirname(stored), target));
  }

  status(filePath: string): FileNumber | undefined {
    const resolved = this.#resolve(filePath);
    return resolved === undefined
      ? undefined
      : { device: 1n, file: BigInt(this.#paths.indexOf(resolved) + 1) };
  }

  realPath(filePath: string): string {
    return this.#resolve(filePath) ?? filePath;
  }

  linkTarget(filePath: string): string | undefined {
    const parent = path.dirname(filePath);
    const base =
      parent === filePath
        ? filePath
        : path.join(this.#resolve(parent) ?? parent, path.basename(filePath));
    const stored = this.#stored(base);
    return stored === undefined ? undefined : this.#links.get(stored);
  }

  entries(directory: string): readonly string[] {
    return this.#paths
      .filter((entry) => path.dirname(entry) === directory && entry !== directory)
      .map((entry) => path.basename(entry));
  }
}

describe("fileIdentityKey", () => {
  it("fileIdentityKey of missing files in another letter case is equal when the file system ignores case", () => {
    const tree = new InMemoryTree(["/work/redocly.yaml"], true);

    expect(fileIdentityKey(at("/work/gen/Types.ts"), tree)).toBe(
      fileIdentityKey(at("/work/GEN/types.ts"), tree),
    );
  });

  it("fileIdentityKey of missing files in another letter case differs when the file system keeps case", () => {
    const tree = new InMemoryTree(["/work/redocly.yaml"], false);

    expect(fileIdentityKey(at("/work/gen/Types.ts"), tree)).not.toBe(
      fileIdentityKey(at("/work/gen/types.ts"), tree),
    );
  });

  it("fileIdentityKey of a missing file through a linked directory is the one in its target", () => {
    const tree = new InMemoryTree(
      ["/work/real/a.yaml"],
      false,
      new Map([["/work/link", "/work/real"]]),
    );

    expect(fileIdentityKey(at("/work/link/types.ts"), tree)).toBe(at("/work/real/types.ts"));
  });

  it("fileIdentityKey of a missing file through a link to a missing directory is the one in its target", () => {
    const tree = new InMemoryTree(
      ["/work/a.yaml"],
      false,
      new Map([["/work/link", "/work/missing"]]),
    );

    expect(fileIdentityKey(at("/work/link/x.ts"), tree)).toBe(
      fileIdentityKey(at("/work/missing/x.ts"), tree),
    );
  });

  it("fileIdentityKey reads a relative link target from the real directory of the link", () => {
    const tree = new InMemoryTree(
      ["/work/real/sub/a.yaml"],
      false,
      new Map([
        ["/work/a", "/work/real/sub"],
        ["/work/real/sub/link", "../missing"],
      ]),
    );

    expect(fileIdentityKey(at("/work/a/link/x.ts"), tree)).toBe(at("/work/real/missing/x.ts"));
  });

  it("fileIdentityKey of a path through a link loop ends and keeps the path", () => {
    const tree = new InMemoryTree(
      ["/work/a.yaml"],
      false,
      new Map([
        ["/work/loop-a", "/work/loop-b"],
        ["/work/loop-b", "/work/loop-a"],
      ]),
    );

    expect(fileIdentityKey(at("/work/loop-a/x.ts"), tree)).toMatch(/x\.ts$/);
  });

  it("fileIdentityKey of an existing file is its stored spelling", () => {
    const tree = new InMemoryTree(["/work/Types.ts"], true);

    expect(fileIdentityKey(at("/work/types.ts"), tree)).toBe(at("/work/Types.ts"));
  });

  it("fileIdentityKey tells the letter case rules by the directory itself when it has no entry with letters", () => {
    const ignoring = new InMemoryTree(["/work/empty/"], true);
    const keeping = new InMemoryTree(["/work/empty/"], false);

    expect(fileIdentityKey(at("/work/empty/A.ts"), ignoring)).toBe(at("/work/empty/a.ts"));
    expect(fileIdentityKey(at("/work/empty/A.ts"), keeping)).toBe(at("/work/empty/A.ts"));
  });

  it("fileIdentityKey takes names as case-sensitive when nothing with letters can be looked up", () => {
    const tree = new InMemoryTree(["/1/2"], true);

    expect(fileIdentityKey(at("/1/A.ts"), tree)).toBe(at("/1/A.ts"));
  });

  it("fileIdentityKey skips an entry it cannot read when it tells the letter case rules", () => {
    const tree = new InMemoryTree(
      ["/work/b.yaml"],
      true,
      new Map([["/work/a-dangling", "/gone/x"]]),
    );

    expect(fileIdentityKey(at("/work/New.ts"), tree)).toBe(at("/work/new.ts"));
  });
});

describe("isSameFileNumber", () => {
  it("isSameFileNumber with the file number 0 is false, since it proves nothing", () => {
    expect(isSameFileNumber({ device: 1n, file: 0n }, { device: 1n, file: 0n })).toBe(false);
    expect(isSameFileNumber({ device: 1n, file: 7n }, { device: 1n, file: 7n })).toBe(true);
    expect(isSameFileNumber({ device: 1n, file: 7n }, { device: 2n, file: 7n })).toBe(false);
  });
});
