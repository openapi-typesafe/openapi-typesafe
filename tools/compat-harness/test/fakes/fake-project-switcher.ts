import type { ProjectSwitcher, ProjectSwitchSummary } from "../../src/application/ports.ts";
import type { SwitchedPackageSpecs } from "../../src/domain/package-switch.ts";

/** ProjectSwitcher that records its calls and reports a fixed summary for both rewrites. */
export class FakeProjectSwitcher implements ProjectSwitcher {
  readonly calls: { projectRoot: string; specs: SwitchedPackageSpecs }[] = [];
  readonly pinnedRoots: string[] = [];
  readonly #summary: ProjectSwitchSummary;

  constructor(summary: ProjectSwitchSummary = { changedFileCount: 1, replacementCount: 2 }) {
    this.#summary = summary;
  }

  async switchProject(
    projectRoot: string,
    specs: SwitchedPackageSpecs,
  ): Promise<ProjectSwitchSummary> {
    this.calls.push({ projectRoot, specs });
    return this.#summary;
  }

  async pinUpstreamVersions(projectRoot: string): Promise<ProjectSwitchSummary> {
    this.pinnedRoots.push(projectRoot);
    return this.#summary;
  }
}
