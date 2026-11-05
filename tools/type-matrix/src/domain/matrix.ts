/**
 * The consumer type matrix (ENGINEERING_PLAN 8.1, ADR-006): every supported TypeScript version
 * type-checks the generated examples and the clients, once with `strict`, once with the strict
 * consumer flags, and once as a CommonJS consumer of the clients. A non-blocking version (a beta) is reported but does not fail the run.
 */

export interface TypeScriptVersion {
  /** The id used on the command line and in CI, e.g. `5.4`. */
  readonly id: string;
  /** The aliased npm package that installs this compiler (`package.json` devDependencies). */
  readonly packageName: string;
  readonly isBlocking: boolean;
}

export interface ConsumerProject {
  readonly id: string;
  /** The tsconfig file, relative to the consumer directory. */
  readonly tsconfig: string;
}

/** Lowest supported (ADR-006), latest 5.x, 6.x, 7.x, and the next 7.x beta. */
export const TYPESCRIPT_VERSIONS: readonly TypeScriptVersion[] = [
  { id: "5.4", packageName: "typescript-5.4", isBlocking: true },
  { id: "5.9", packageName: "typescript-5.9", isBlocking: true },
  { id: "6.0", packageName: "typescript-6.0", isBlocking: true },
  { id: "7.0", packageName: "typescript-7.0", isBlocking: true },
  { id: "7.1-beta", packageName: "typescript-7.1-beta", isBlocking: false },
];

export const CONSUMER_PROJECTS: readonly ConsumerProject[] = [
  { id: "strict", tsconfig: "tsconfig.json" },
  {
    id: "strict-flags",
    tsconfig: "tsconfig.strict-flags.json",
  },
  { id: "commonjs", tsconfig: "tsconfig.commonjs.json" },
];

/** One compiler on one consumer project. */
export interface MatrixCell {
  readonly version: TypeScriptVersion;
  readonly project: ConsumerProject;
}

export interface CellResult {
  readonly cell: MatrixCell;
  readonly isPassed: boolean;
  /** The compiler output (its errors), empty when the check passed. */
  readonly output: string;
  readonly durationMs: number;
}

/** Thrown for a version id that is not in the matrix. */
export class UnknownVersionError extends Error {
  constructor(id: string, known: readonly TypeScriptVersion[]) {
    super(`Unknown TypeScript version "${id}"; known: ${known.map((v) => v.id).join(", ")}`);
    this.name = "UnknownVersionError";
  }
}

/** The versions to run: all of them, or the requested ids in matrix order. */
export function selectVersions(
  all: readonly TypeScriptVersion[],
  requestedIds: readonly string[],
): readonly TypeScriptVersion[] {
  for (const id of requestedIds) {
    if (!all.some((version) => version.id === id)) {
      throw new UnknownVersionError(id, all);
    }
  }
  return requestedIds.length === 0 ? all : all.filter((v) => requestedIds.includes(v.id));
}

/** Every version on every project, version by version. */
export function matrixCells(
  versions: readonly TypeScriptVersion[],
  projects: readonly ConsumerProject[],
): readonly MatrixCell[] {
  return versions.flatMap((version) => projects.map((project) => ({ version, project })));
}

/** Whether the run fails: a blocking version failed on some project. */
export function hasBlockingFailure(results: readonly CellResult[]): boolean {
  return results.some((result) => !result.isPassed && result.cell.version.isBlocking);
}
