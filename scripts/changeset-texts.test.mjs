// Run by `lint:changesets` with the test runner of Node.js: `node --test <this file>`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findInternalReferences } from "./changeset-texts.mjs";

const namesIn = (text) => findInternalReferences(text).map(({ name }) => name);

describe("findInternalReferences", () => {
  it("finds an ADR however it is written", () => {
    for (const text of ["See ADR-043.", "as ADR 043 says", "adr-043", "ADR043"]) {
      assert.deepEqual(namesIn(text), ["an ADR"], text);
    }
  });

  it("finds a link or a path into the ADR folder", () => {
    for (const text of ["[why](../adr/033-remote-ref-hardening.md)", "read adr/033.md"]) {
      assert.deepEqual(namesIn(text), ["an ADR file"], text);
    }
  });

  it("finds audits and hunts with their report items", () => {
    assert.deepEqual(namesIn("found by the security audit (B2)"), ["an audit", "a report item"]);
    assert.deepEqual(namesIn("the round-2 hunt (S4) found it"), ["a hunt", "a report item"]);
    assert.deepEqual(namesIn("Fixes PB-14."), ["a report item"]);
    assert.deepEqual(namesIn("a check (RC4 S4) and (G13)"), ["a report item"]);
  });

  it("passes texts that changelog readers can look up", () => {
    const texts = [
      "Run `npm audit` after you upgrade.",
      "Fixes TS2589 (upstream [#1882](https://github.com/openapi-ts/openapi-typescript/issues/1882)).",
      "Dates use ISO 8601 and bodies UTF-8; see threat model T2 (R1).",
      "A file in `docs/adr-guide/` or a `badr/` folder.",
      "Amazon S3 URLs and the `S3` key.",
    ];
    for (const text of texts) {
      assert.deepEqual(namesIn(text), [], text);
    }
  });

  it("reports the line of each reference", () => {
    assert.deepEqual(findInternalReferences("first\nsee ADR-001\n"), [
      { line: 2, name: "an ADR", text: "see ADR-001" },
    ]);
  });
});
