import type {
  GitInvocation,
  GitProcess,
  GitRun,
} from "../../src/adapters/git-file-list/git-process.js";

const NOT_A_REPOSITORY_EXIT_CODE = 128;

/**
 * A git process that records each invocation and answers `check-ignore` with "not ignored",
 * `rev-parse` with whether the folder is one of `repositories` (every folder when undefined) and
 * `ls-files` with the fixed output.
 */
export class RecordingGitProcess {
  readonly invocations: GitInvocation[] = [];
  readonly #output: string;
  readonly #repositories: ReadonlySet<string> | undefined;

  constructor(output: string, repositories?: ReadonlySet<string>) {
    this.#output = output;
    this.#repositories = repositories;
  }

  readonly run: GitProcess = (invocation) => {
    this.invocations.push(invocation);
    return Promise.resolve(this.#answer(invocation));
  };

  #answer({ gitArguments, directory }: GitInvocation): GitRun {
    if (gitArguments.includes("check-ignore")) {
      return { kind: "exited", exitCode: 1, output: "", errors: "" };
    }
    if (gitArguments.includes("rev-parse")) {
      const isRepository = this.#repositories?.has(directory) ?? true;
      const exitCode = isRepository ? 0 : NOT_A_REPOSITORY_EXIT_CODE;
      return { kind: "exited", exitCode, output: "", errors: "" };
    }
    return { kind: "exited", exitCode: 0, output: this.#output, errors: "" };
  }
}
