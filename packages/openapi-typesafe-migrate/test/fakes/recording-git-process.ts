import type {
  GitInvocation,
  GitProcess,
  GitRun,
} from "../../src/adapters/git-file-list/git-process.js";

/**
 * A git process that records each invocation and answers `check-ignore` with "not ignored" and
 * `ls-files` with the fixed output.
 */
export class RecordingGitProcess {
  readonly invocations: GitInvocation[] = [];
  readonly #output: string;

  constructor(output: string) {
    this.#output = output;
  }

  readonly run: GitProcess = (invocation) => {
    this.invocations.push(invocation);
    const isCheckIgnore = invocation.gitArguments.includes("check-ignore");
    const run: GitRun = isCheckIgnore
      ? { kind: "exited", exitCode: 1, output: "", errors: "" }
      : { kind: "exited", exitCode: 0, output: this.#output, errors: "" };
    return Promise.resolve(run);
  };
}
