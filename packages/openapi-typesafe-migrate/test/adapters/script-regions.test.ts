import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";
import { scriptRegions } from "../../src/adapters/typescript-parser/script-regions.js";

/** Far above the few milliseconds a linear scan takes, far below the seconds of a quadratic one. */
const TIME_LIMIT_MS = 1000;
const LONG_INPUT_LENGTH = 640_000;

describe("scriptRegions", () => {
  it("scriptRegions gives each closed block, with attributes in any case", () => {
    const text = '<template/>\n<SCRIPT lang="ts">a</script >\n<script>b</Script>\n';

    const regions = scriptRegions(text, "App.vue");

    expect(regions).toEqual([
      { offset: text.indexOf("a<"), text: "a", kind: ts.ScriptKind.TS },
      { offset: text.indexOf("b<"), text: "b", kind: ts.ScriptKind.JS },
    ]);
  });

  it("scriptRegions ends a block at the first closing tag and skips an unclosed one", () => {
    const text = "<script>a <script>b</script>c<script>d";

    const regions = scriptRegions(text, "App.svelte");

    expect(regions.map((region) => region.text)).toEqual(["a <script>b"]);
  });

  it("scriptRegions gives the ESM blocks of MDX up to a blank line, outside code fences", () => {
    const text = [
      'import a from "a";',
      'export { b } from "b";',
      "  ",
      "# Title",
      "important text",
      "````md",
      'import c from "c";',
      "```",
      'import d from "d";',
      "````",
      "~~~",
      'export * from "e";',
      "```",
      'export * from "g";',
      "~~~",
      'export const f = "f";',
    ].join("\n");

    const regions = scriptRegions(text, "docs/page.mdx");

    expect(regions).toEqual([
      {
        offset: 0,
        text: 'import a from "a";\nexport { b } from "b";',
        kind: ts.ScriptKind.JSX,
      },
      {
        offset: text.indexOf("export const"),
        text: 'export const f = "f";',
        kind: ts.ScriptKind.JSX,
      },
    ]);
  });

  it("scriptRegions does not take a longer tag name for a script tag", () => {
    const text = "<scripts>a</scripts><script>c</script>";

    expect(scriptRegions(text, "App.vue").map((region) => region.text)).toEqual(["c"]);
  });

  it("scriptRegions takes linear time on many script tags that are never closed", () => {
    const text = "<script>".repeat(LONG_INPUT_LENGTH / "<script>".length);
    const started = performance.now();

    expect(scriptRegions(text, "App.vue")).toEqual([]);
    expect(performance.now() - started).toBeLessThan(TIME_LIMIT_MS);
  });

  it("scriptRegions takes linear time on a closing tag followed by spaces only", () => {
    const text = `<script></script${" ".repeat(LONG_INPUT_LENGTH)}`;
    const started = performance.now();

    expect(scriptRegions(text, "App.vue")).toEqual([]);
    expect(performance.now() - started).toBeLessThan(TIME_LIMIT_MS);
  });
});
