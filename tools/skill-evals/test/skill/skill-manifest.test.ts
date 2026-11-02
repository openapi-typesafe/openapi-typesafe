import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the published skill against the Agent Skills format (https://agentskills.io/specification):
 * a broken manifest or link would make agents skip or misread it without any error.
 */
const SKILL_DIR = resolve(
  fileURLToPath(new URL("../../../../skills/openapi-typesafe", import.meta.url)),
);
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1_024;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function frontmatter(text: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (match?.[1] === undefined) {
    throw new Error("SKILL.md has no frontmatter");
  }
  return Object.fromEntries(
    match[1].split("\n").map((line) => {
      const separator = line.indexOf(": ");
      return [line.slice(0, separator), line.slice(separator + 2)];
    }),
  );
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(path);
    }
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("skills/openapi-typesafe", () => {
  const manifest = frontmatter(readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8"));

  it("has a name that matches its directory and the format rules", () => {
    expect(manifest.name).toBe("openapi-typesafe");
    expect(manifest.name?.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(manifest.name).toMatch(NAME_PATTERN);
  });

  it("has a description of at most 1024 characters", () => {
    expect(manifest.description?.length ?? 0).toBeGreaterThan(0);
    expect(manifest.description?.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
  });

  it("links only to files that exist", () => {
    const missing = markdownFiles(SKILL_DIR).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/\]\((?!https?:)([^)#]+)\)/g)]
        .map((match) => match[1] as string)
        .filter((target) => !existsSync(resolve(dirname(file), target)))
        .map((target) => `${file}: ${target}`),
    );

    expect(missing).toEqual([]);
  });
});
