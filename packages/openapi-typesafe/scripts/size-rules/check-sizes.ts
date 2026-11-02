/**
 * CI check for the size rules that Biome cannot enforce (ENGINEERING_PLAN §5.3).
 *
 * Usage: vite-node scripts/size-rules/check-sizes.ts <directory> [...]
 * Prints one line per violation as `file:line message` and exits with 1 if there is any.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { findSizeViolations, SIZE_LIMITS } from "./size-violations.js";

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => path.join(directory, name))
    .sort();
}

function reportViolations(fileName: string): number {
  const violations = findSizeViolations(
    ts,
    { fileName, text: readFileSync(fileName, "utf8") },
    SIZE_LIMITS,
  );
  for (const violation of violations) {
    process.stdout.write(`${fileName}:${violation.line} ${violation.message}\n`);
  }
  return violations.length;
}

function main(directories: readonly string[]): number {
  const files = directories.flatMap(listTypeScriptFiles);
  const total = files.reduce((count, fileName) => count + reportViolations(fileName), 0);
  process.stdout.write(`checked ${files.length} files, ${total} size violations\n`);
  return total === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
