import type {
  FileProblem,
  FileRead,
  FileWrite,
  ProjectFileList,
  ProjectFiles,
  SkippedFile,
} from "../../src/application/ports.js";

/** Files the fake cannot read or write, each with the problem it gives. */
export interface FileProblems {
  readonly unreadable?: Readonly<Record<string, FileProblem>>;
  readonly unwritable?: Readonly<Record<string, FileProblem>>;
}

/** A project tree in memory; `written` records every write in order. */
export class InMemoryProjectFiles implements ProjectFiles {
  readonly files: Map<string, string>;
  readonly written: string[] = [];
  readonly #skipped: readonly SkippedFile[];
  readonly #problems: FileProblems;

  constructor(
    files: Readonly<Record<string, string>>,
    skipped: readonly SkippedFile[] = [],
    problems: FileProblems = {},
  ) {
    this.files = new Map(Object.entries(files));
    this.#skipped = skipped;
    this.#problems = problems;
  }

  listFiles(): Promise<ProjectFileList> {
    return Promise.resolve({ files: [...this.files.keys()], skipped: this.#skipped });
  }

  read(path: string): Promise<FileRead> {
    const problem = this.#problems.unreadable?.[path];
    const text = this.files.get(path);
    if (problem !== undefined || text === undefined) {
      return Promise.resolve({
        kind: "skipped",
        reason: problem ?? { kind: "io-error", code: "ENOENT" },
      });
    }
    return Promise.resolve({ kind: "read", text });
  }

  write(path: string, text: string): Promise<FileWrite> {
    const problem = this.#problems.unwritable?.[path];
    if (problem !== undefined) {
      return Promise.resolve({ kind: "failed", reason: problem });
    }
    this.files.set(path, text);
    this.written.push(path);
    return Promise.resolve({ kind: "written" });
  }
}
