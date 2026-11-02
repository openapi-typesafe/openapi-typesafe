import { readFileSync } from "node:fs";
import { kebabCase } from "scule";
import { describe, expect, it } from "vitest";
import { GENERATOR_FLAGS } from "../../src/cli/cli-arguments.js";
import { HELP_TEXT } from "../../src/cli/help-text.js";

const CLI_DOCS = readFileSync(new URL("../../../../docs/cli.md", import.meta.url), "utf8");

/** `lint` is on by default, so users only ever type its negative form. */
function spelledFlag(flag: string): string {
  return flag === "lint" ? "--no-lint" : `--${kebabCase(flag)}`;
}

describe("CLI help and docs", () => {
  it.each(GENERATOR_FLAGS.map(spelledFlag))("--help lists %s", (flag) => {
    expect(HELP_TEXT).toMatch(new RegExp(`^  ${flag}\\b`, "m"));
  });

  it.each(GENERATOR_FLAGS.map(spelledFlag))("the flag table of docs/cli.md lists %s", (flag) => {
    expect(CLI_DOCS).toMatch(new RegExp(`^\\| \`${flag}\\b`, "m"));
  });
});
