/// <reference types="node" />
/**
 * Printer performance check (ENGINEERING_PLAN 4.5). For every generated file given on the command
 * line: read its declarations into IR, check that the IR printer reproduces the file body byte for
 * byte, then compare the median time of the IR printer with the original path (TypeScript factory
 * nodes printed by the TypeScript printer). Writes JSON lines to `.logs/bench-printer/`.
 *
 * Usage: vite-node scripts/bench-printer/main.ts [--iterations <n>] <generated.ts>...
 * Exit code 1 when any file differs or the IR printer is slower than the TypeScript printer.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import { toStatement } from "../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import { printNodes } from "../../src/application/print/print-nodes.js";
import type { IrDeclaration } from "../../src/domain/ir/nodes.js";
import { measure, type Timing } from "./measure.js";
import {
  InvalidSourceError,
  parseDeclarations,
  UnsupportedSyntaxError,
} from "./typescript-to-ir.js";

const DEFAULT_ITERATIONS = 5;
const LOG_DIRECTORY = resolve(import.meta.dirname, "../../../../.logs/bench-printer");
/** The generator writes this header before the printed declarations (`COMMENT_HEADER`). */
const HEADER_END = "*/\n\n";
/**
 * Below this median the TypeScript printer finishes within timer resolution and GC noise, so the
 * speed comparison is reported but not enforced (output identity is always enforced).
 */
const MIN_COMPARABLE_MS = 10;

interface FileResult {
  readonly file: string;
  readonly bytes: number;
  readonly declarations: number;
  readonly isIdentical: boolean;
  readonly typescriptBuildAndPrint: Timing;
  readonly typescriptPrintOnly: Timing;
  readonly irPrint: Timing;
}

/** The original `astToString`: statements set on an empty source file, printed with LF. */
function printWithTypeScript(statements: readonly ts.Statement[]): string {
  const source = ts.createSourceFile("openapi-ts.ts", "", ts.ScriptTarget.ESNext, false);
  const file = ts.factory.updateSourceFile(source, statements);
  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(file);
}

function readBody(path: string): string {
  const text = readFileSync(path, "utf8");
  return text.slice(text.indexOf(HEADER_END) + HEADER_END.length);
}

function benchmarkFile(path: string, iterations: number): FileResult {
  const body = readBody(path);
  const declarations: IrDeclaration[] = parseDeclarations(body);
  const statements = declarations.map((declaration) => toStatement(ts, declaration));
  const options = { iterations, now: () => performance.now() };
  return {
    file: join(basename(dirname(path)), basename(path)),
    bytes: Buffer.byteLength(body),
    declarations: declarations.length,
    isIdentical: printNodes(declarations) === body && printWithTypeScript(statements) === body,
    typescriptBuildAndPrint: measure(
      () => printWithTypeScript(declarations.map((declaration) => toStatement(ts, declaration))),
      options,
    ),
    typescriptPrintOnly: measure(() => printWithTypeScript(statements), options),
    irPrint: measure(() => printNodes(declarations), options),
  };
}

function parseArguments(argv: readonly string[]): { iterations: number; files: string[] } {
  const flagIndex = argv.indexOf("--iterations");
  if (flagIndex === -1) {
    return { iterations: DEFAULT_ITERATIONS, files: [...argv] };
  }
  const files = argv.filter((_, index) => index !== flagIndex && index !== flagIndex + 1);
  return { iterations: Number(argv[flagIndex + 1]), files };
}

function isPassing(result: FileResult): boolean {
  const isComparable = result.typescriptPrintOnly.medianMs >= MIN_COMPARABLE_MS;
  const isFastEnough =
    !isComparable || result.irPrint.medianMs <= result.typescriptPrintOnly.medianMs;
  return result.isIdentical && isFastEnough;
}

function summarize(result: FileResult): string {
  const speedup = result.typescriptPrintOnly.medianMs / result.irPrint.medianMs;
  return [
    `${isPassing(result) ? "ok  " : "FAIL"} ${result.file}`,
    `${(result.bytes / 1e6).toFixed(1)} MB`,
    `identical=${result.isIdentical}`,
    `ts build+print ${result.typescriptBuildAndPrint.medianMs.toFixed(0)} ms`,
    `ts print ${result.typescriptPrintOnly.medianMs.toFixed(0)} ms`,
    `ir print ${result.irPrint.medianMs.toFixed(0)} ms (${speedup.toFixed(1)}x)`,
  ].join("  ");
}

/**
 * Benchmark one file. Unsupported syntax fails the run. A file that is not valid TypeScript is
 * logged as skipped: there is nothing to compare, and the defect belongs to the original.
 */
function runFile(file: string, iterations: number, logFile: string): boolean {
  try {
    const result = benchmarkFile(file, iterations);
    appendFileSync(logFile, `${JSON.stringify(result)}\n`);
    process.stdout.write(`${summarize(result)}\n`);
    return isPassing(result);
  } catch (error) {
    if (error instanceof InvalidSourceError) {
      appendFileSync(logFile, `${JSON.stringify({ file, skipped: error.message })}\n`);
      process.stdout.write(`SKIP  ${file}  ${error.message}\n`);
      return true;
    }
    if (!(error instanceof UnsupportedSyntaxError)) {
      throw error;
    }
    appendFileSync(logFile, `${JSON.stringify({ file, error: error.message })}\n`);
    process.stdout.write(`ERROR ${file}  ${error.message}\n`);
    return false;
  }
}

function main(argv: readonly string[]): number {
  const { iterations, files } = parseArguments(argv);
  mkdirSync(LOG_DIRECTORY, { recursive: true });
  const logFile = resolve(LOG_DIRECTORY, `${new Date().toISOString().replaceAll(":", "-")}.jsonl`);
  process.stdout.write(`Log: ${logFile}\n`);
  // Every file runs even after a failure, so one run reports all of them.
  const passed = files.map((file) => runFile(file, iterations, logFile));
  return passed.every(Boolean) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
