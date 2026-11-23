import type { BenchGenerator, DocumentResult } from "./benchmark.ts";

/** The machine a benchmark ran on; timings mean little without it. */
export interface BenchEnvironment {
  readonly cpu: string;
  readonly memoryBytes: number;
  readonly operatingSystem: string;
  readonly node: string;
}

export interface BenchReport {
  readonly environment: BenchEnvironment;
  readonly candidate: BenchGenerator;
  readonly baseline: BenchGenerator;
  readonly warmupRuns: number;
  readonly measuredRuns: number;
  readonly results: readonly DocumentResult[];
}

const BYTES_PER_KB = 1_000;
const BYTES_PER_MB = 1_000_000;
const BYTES_PER_GB = 1_000_000_000;
const MS_PER_SECOND = 1_000;
const PERCENT = 100;

/** `412 ms` below one second, `12.9 s` from one second on. */
export function formatDuration(milliseconds: number): string {
  return milliseconds < MS_PER_SECOND
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / MS_PER_SECOND).toFixed(1)} s`;
}

/** Decimal units, as npm and file managers print sizes: `5 KB` below 1 MB, `27.6 MB` above. */
export function formatBytes(bytes: number): string {
  return bytes < BYTES_PER_MB
    ? `${Math.round(bytes / BYTES_PER_KB)} KB`
    : `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

/** The measured time against a baseline time: `13% faster`, `25% slower` or `same`. */
export function formatChange(measured: number, baseline: number): string {
  const percent = Math.round((measured / baseline - 1) * PERCENT);
  if (percent === 0) {
    return "same";
  }
  return percent < 0 ? `${-percent}% faster` : `${percent}% slower`;
}

function header(candidate: BenchGenerator, baseline: BenchGenerator): string[] {
  const columns = [
    "Document",
    "Input",
    `${candidate.label}: time`,
    `${baseline.label}: time`,
    "Time difference",
    `${candidate.label}: peak RSS`,
    `${baseline.label}: peak RSS`,
  ];
  return [`| ${columns.join(" | ")} |`, `|${columns.map(() => "---").join("|")}|`];
}

function row(result: DocumentResult): string {
  const { candidate, baseline } = result;
  const cells = [
    result.document.label,
    formatBytes(result.bytes),
    formatDuration(candidate.medianWallMs),
    formatDuration(baseline.medianWallMs),
    formatChange(candidate.medianWallMs, baseline.medianWallMs),
    formatBytes(candidate.medianPeakRssBytes),
    formatBytes(baseline.medianPeakRssBytes),
  ];
  return `| ${cells.join(" | ")} |`;
}

/** The environment line and the result table, as Markdown for docs/benchmarks.md. */
export function renderReport(report: BenchReport): string {
  const { environment } = report;
  const memory = `${Math.round(environment.memoryBytes / BYTES_PER_GB)} GB`;
  return [
    `Machine: ${environment.cpu}, ${memory} RAM, ${environment.operatingSystem}, ` +
      `Node.js ${environment.node}.`,
    `Median of ${report.measuredRuns} runs after ${report.warmupRuns} warm-up run(s); ` +
      "default options; peak RSS is the median of the per-run peaks.",
    "",
    ...header(report.candidate, report.baseline),
    ...report.results.map(row),
    "",
  ].join("\n");
}
