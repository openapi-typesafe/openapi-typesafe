import { describe, expect, it } from "vitest";
import { filesLinkedToOldNames } from "../../src/application/linked-files.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";

describe("filesLinkedToOldNames", () => {
  it("filesLinkedToOldNames gives every file of a chain whose file names an old package", async () => {
    const files = new InMemoryProjectFiles({
      a: "x",
      b: "y",
      c: "npx openapi-typescript",
      d: "x",
      e: "y",
    });

    const linked = await filesLinkedToOldNames(
      [
        ["a", "b"],
        ["d", "e"],
        ["b", "c"],
      ],
      files,
    );

    expect([...linked].sort()).toEqual(["a", "b", "c"]);
  });

  it("filesLinkedToOldNames gives no file of a group whose old name is in an unreadable file", async () => {
    const files = new InMemoryProjectFiles({ a: "x", b: "openapi-fetch" }, [], {
      unreadable: { b: { kind: "not-utf-8" } },
    });

    expect([...(await filesLinkedToOldNames([["a", "b"]], files))]).toEqual([]);
  });
});
