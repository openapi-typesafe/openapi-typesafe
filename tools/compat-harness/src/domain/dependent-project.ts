/**
 * A real open-source project that depends on the original packages (ENGINEERING_PLAN 8.4). The
 * harness clones it at a pinned commit, runs its own scripts once as it is (the baseline) and once
 * switched to openapi-typesafe by package name only (the candidate), and compares the two runs.
 */

/** Package managers the harness can install a project with; a closed set owned by the harness. */
export const PackageManager = {
  Npm: "npm",
  Pnpm: "pnpm",
  Bun: "bun",
} as const;

export type PackageManager = (typeof PackageManager)[keyof typeof PackageManager];

/** One command of a project, run without a shell: the first element is the executable. */
export interface ProjectStep {
  readonly name: string;
  readonly command: readonly string[];
}

export interface DependentProject {
  /** Stable id: lowercase letters, digits and dashes; used in cache paths and reports. */
  readonly id: string;
  /** `https://github.com/<owner>/<repository>` without a trailing `.git`. */
  readonly repository: string;
  /** Full 40-character commit SHA; a branch name would make runs irreproducible. */
  readonly commit: string;
  readonly packageManager: PackageManager;
  /**
   * Directory the install and the steps run in, relative to the repository root. Package managers
   * find the workspace root themselves, so a workspace member directory installs the workspace.
   */
  readonly directory: string;
  /** Steps after the install, in order; each depends on the ones before it. */
  readonly steps: readonly ProjectStep[];
  /** Files the steps generate with the original generator, relative to `directory`. */
  readonly generatedFiles: readonly string[];
  /** Why the steps are what they are (scripts left out, extra setup); shown in the report. */
  readonly notes: string;
}

export const DEPENDENTS_SCHEMA_VERSION = 1;

/** `corpus/dependents.json`: the curated list of dependent projects. */
export interface DependentsManifest {
  readonly schemaVersion: typeof DEPENDENTS_SCHEMA_VERSION;
  readonly projects: readonly DependentProject[];
}

/**
 * Install command of each package manager. Lifecycle scripts are disabled, because install
 * scripts of third-party dependencies would run arbitrary code; a project that needs one (for
 * example `svelte-kit sync`) lists it as an explicit step. The lockfile is not frozen, because the
 * candidate changes `package.json`; the baseline uses the same command so both runs resolve alike.
 */
export const INSTALL_COMMANDS: Readonly<Record<PackageManager, readonly string[]>> = {
  [PackageManager.Npm]: ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"],
  [PackageManager.Pnpm]: ["pnpm", "install", "--ignore-scripts", "--no-frozen-lockfile"],
  [PackageManager.Bun]: ["bun", "install", "--ignore-scripts"],
};

/** Names of the steps the harness adds around the project steps; project steps cannot use them. */
export const HarnessStepName = {
  Fetch: "fetch",
  Checkout: "checkout",
  Install: "install",
} as const;
