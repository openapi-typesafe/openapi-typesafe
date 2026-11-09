import {
  type DependentProject,
  HarnessStepName,
  INSTALL_COMMANDS,
  type ProjectStep,
} from "../../domain/dependent-project.ts";
import {
  classifyDependent,
  comparedGeneratedFile,
  type DependentResult,
  type GeneratedFileComparison,
  isAcceptedStatus,
  missingGeneratedFile,
  RunVariant,
  type StepResult,
  StepStatus,
} from "../../domain/dependent-result.ts";
import type { IntentionalDifference } from "../../domain/intentional-differences.ts";
import type { SwitchedPackageSpecs } from "../../domain/package-switch.ts";
import { compareGeneratedTexts } from "../../domain/text-comparison.ts";
import { encodeJson } from "../codecs.ts";
import { isSuccessful } from "../commands.ts";
import {
  DEPENDENTS_RESULTS_PATH,
  dependentCheckoutPath,
  dependentRepositoryPath,
  joinPath,
} from "../layout.ts";
import type {
  CommandOutcome,
  CommandRunner,
  DirectoryEraser,
  FileStore,
  Logger,
  ProjectSwitcher,
} from "../ports.ts";

export interface CheckDependentsDependencies {
  readonly runner: CommandRunner;
  readonly switcher: ProjectSwitcher;
  readonly eraser: DirectoryEraser;
  /** The dependents work directory (repositories and checkouts). */
  readonly work: FileStore;
  /** The harness cache, which keeps the results for the report. */
  readonly cache: FileStore;
  readonly logger: Logger;
  readonly intentionalDifferences: readonly IntentionalDifference[];
}

export interface CheckDependentsInput {
  readonly projects: readonly DependentProject[];
  readonly specs: SwitchedPackageSpecs;
  readonly timeoutMs: number;
  /** Absolute directory for the full output of every step. */
  readonly stepLogDirectory: string;
}

/** Everything one project run needs; built once per project. */
interface ProjectContext {
  readonly dependencies: CheckDependentsDependencies;
  readonly input: CheckDependentsInput;
  readonly project: DependentProject;
}

/** A step bound to its working directory. */
interface PlannedStep extends ProjectStep {
  readonly cwd: string;
}

function stepStatus(outcome: CommandOutcome): StepStatus {
  if (outcome.isTimedOut) {
    return StepStatus.TimedOut;
  }
  return isSuccessful(outcome) ? StepStatus.Passed : StepStatus.Failed;
}

function stepResult(name: string, outcome: CommandOutcome): StepResult {
  const status = stepStatus(outcome);
  const outputExcerpt = status === StepStatus.Passed ? "" : outcome.outputTail;
  return { name, status, durationMs: outcome.durationMs, outputExcerpt };
}

const notRun = (steps: readonly ProjectStep[]): StepResult[] =>
  steps.map((step) => ({
    name: step.name,
    status: StepStatus.NotRun,
    durationMs: 0,
    outputExcerpt: "",
  }));

/** Run steps in order; after the first failure the remaining steps are not run. */
async function runSteps(
  context: ProjectContext,
  variant: RunVariant,
  steps: readonly PlannedStep[],
): Promise<StepResult[]> {
  const { runner } = context.dependencies;
  const results: StepResult[] = [];
  for (const [index, step] of steps.entries()) {
    // Step names are unique per project (checked when the manifest is read).
    const logPath = joinPath(
      context.input.stepLogDirectory,
      context.project.id,
      variant,
      `${step.name}.log`,
    );
    const outcome = await runner.run({ ...step, timeoutMs: context.input.timeoutMs, logPath });
    const result = stepResult(step.name, outcome);
    results.push(result);
    if (result.status !== StepStatus.Passed) {
      return [...results, ...notRun(steps.slice(index + 1))];
    }
  }
  return results;
}

/** Make the pinned commit available in the project repository, fetching it when missing. */
async function fetchCommit(context: ProjectContext): Promise<StepResult[]> {
  const { project } = context;
  const repository = context.dependencies.work.resolve(dependentRepositoryPath(project.id));
  const cwd = context.dependencies.work.resolve(".");
  // Re-initializing is harmless; a failure here shows up in the fetch step output.
  await context.dependencies.runner.run({
    cwd,
    command: ["git", "init", "--quiet", repository],
    timeoutMs: context.input.timeoutMs,
  });
  const present = await context.dependencies.runner.run({
    cwd: repository,
    command: ["git", "cat-file", "-e", `${project.commit}^{commit}`],
    timeoutMs: context.input.timeoutMs,
  });
  if (isSuccessful(present)) {
    return [];
  }
  const fetch = ["git", "fetch", "--quiet", "--depth", "1", project.repository, project.commit];
  return runSteps(context, RunVariant.Baseline, [
    { name: HarnessStepName.Fetch, command: fetch, cwd: repository },
  ]);
}

/** The install and project steps of a checkout, bound to the project directory. */
function plannedSteps(project: DependentProject, checkout: string): PlannedStep[] {
  const cwd = joinPath(checkout, project.directory);
  const install = {
    name: HarnessStepName.Install,
    command: INSTALL_COMMANDS[project.packageManager],
  };
  return [install, ...project.steps].map((step) => ({ ...step, cwd }));
}

/** Check out the pinned commit into a fresh worktree of the project repository. */
async function checkOut(context: ProjectContext, variant: RunVariant): Promise<StepResult[]> {
  const { project, dependencies } = context;
  const repository = dependencies.work.resolve(dependentRepositoryPath(project.id));
  const checkout = dependencies.work.resolve(dependentCheckoutPath(project.id, variant));
  await dependencies.eraser.erase(checkout);
  // Forget worktrees whose directories were erased, so the path can be added again.
  const prune = await dependencies.runner.run({
    cwd: repository,
    command: ["git", "worktree", "prune"],
    timeoutMs: context.input.timeoutMs,
  });
  if (!isSuccessful(prune)) {
    dependencies.logger.warn("worktree_prune_failed", {
      project: project.id,
      output: prune.outputTail,
    });
  }
  const command = ["git", "worktree", "add", "--force", "--detach", checkout, project.commit];
  return runSteps(context, variant, [{ name: HarnessStepName.Checkout, command, cwd: repository }]);
}

/**
 * Rewrite a fresh checkout for its run: the baseline is pinned to the upstream releases of the
 * fork, the candidate is switched to openapi-typesafe.
 */
async function prepareCheckout(
  context: ProjectContext,
  variant: RunVariant,
  checkout: string,
): Promise<void> {
  const { switcher, logger } = context.dependencies;
  const isCandidate = variant === RunVariant.Candidate;
  const summary = isCandidate
    ? await switcher.switchProject(checkout, context.input.specs)
    : await switcher.pinUpstreamVersions(checkout);
  const fields = { project: context.project.id, variant, ...summary };
  if (summary.replacementCount === 0) {
    // The manifest entry names a project that does not use the original packages.
    logger.warn("project_rewrite_changed_nothing", fields);
    return;
  }
  logger.info(isCandidate ? "project_switched" : "project_pinned_to_upstream", fields);
}

/** Run one variant of a project: checkout, rewrite, install, project steps. */
async function runVariant(context: ProjectContext, variant: RunVariant): Promise<StepResult[]> {
  const { project, dependencies } = context;
  const checkout = dependencies.work.resolve(dependentCheckoutPath(project.id, variant));
  const steps = plannedSteps(project, checkout);
  const checkoutResults = await checkOut(context, variant);
  if (checkoutResults.some((result) => result.status !== StepStatus.Passed)) {
    return [...checkoutResults, ...notRun(steps)];
  }
  await prepareCheckout(context, variant, checkout);
  return [...checkoutResults, ...(await runSteps(context, variant, steps))];
}

/** Compare every generated file of the baseline checkout with the candidate checkout. */
async function compareGeneratedFiles(context: ProjectContext): Promise<GeneratedFileComparison[]> {
  const { project, dependencies } = context;
  const read = (variant: RunVariant, file: string) =>
    dependencies.work.readText(
      joinPath(dependentCheckoutPath(project.id, variant), project.directory, file),
    );
  const comparisons: GeneratedFileComparison[] = [];
  for (const file of project.generatedFiles) {
    const golden = await read(RunVariant.Baseline, file);
    const candidate = await read(RunVariant.Candidate, file);
    comparisons.push(
      golden === undefined || candidate === undefined
        ? missingGeneratedFile(file)
        : comparedGeneratedFile(
            file,
            compareGeneratedTexts(golden, candidate, dependencies.intentionalDifferences),
          ),
    );
  }
  return comparisons;
}

/** Erase both checkouts of a passed project; failed ones stay for inspection. */
async function eraseCheckouts(context: ProjectContext): Promise<void> {
  for (const variant of Object.values(RunVariant)) {
    const checkout = dependentCheckoutPath(context.project.id, variant);
    await context.dependencies.eraser.erase(context.dependencies.work.resolve(checkout));
  }
}

async function checkProject(context: ProjectContext): Promise<DependentResult> {
  const { project } = context;
  const fetchResults = await fetchCommit(context);
  const isFetched = fetchResults.every((result) => result.status === StepStatus.Passed);
  // Without the commit there is nothing to run; the fetch failure decides the verdict.
  const baseline = isFetched
    ? [...fetchResults, ...(await runVariant(context, RunVariant.Baseline))]
    : fetchResults;
  const candidate = isFetched ? await runVariant(context, RunVariant.Candidate) : [];
  const generatedFiles = await compareGeneratedFiles(context);
  const { expectedFailure } = project;
  const verdict = classifyDependent(baseline, candidate, expectedFailure);
  context.dependencies.logger.info("dependent_checked", {
    project: project.id,
    status: verdict.status,
    failedStep: verdict.failedStep,
  });
  if (isAcceptedStatus(verdict.status)) {
    await eraseCheckouts(context);
  }
  const { id: projectId, repository, commit } = project;
  const checked = { ...verdict, expectedFailure, baseline, candidate, generatedFiles };
  return { projectId, repository, commit, ...checked };
}

/**
 * ENGINEERING_PLAN 8.4: run each dependent project as it is and switched to openapi-typesafe,
 * one project at a time (installs are heavy), and store the results for the report.
 */
export async function checkDependents(
  dependencies: CheckDependentsDependencies,
  input: CheckDependentsInput,
): Promise<DependentResult[]> {
  const results: DependentResult[] = [];
  for (const project of input.projects) {
    results.push(await checkProject({ dependencies, input, project }));
  }
  await dependencies.cache.writeText(DEPENDENTS_RESULTS_PATH, encodeJson(results));
  return results;
}
