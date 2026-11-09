import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import type { Logger, ProjectFiles, ProjectRootState } from "../../src/application/ports.js";
import { HELP_TEXT } from "../../src/cli/cli-text.js";
import { type CliDependencies, EXIT_CODES, runCli } from "../../src/cli/run-cli.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const LOG_PATH = "/tmp/run.jsonl";

function setUp(
  createFiles: (root: string) => ProjectFiles,
  rootState: ProjectRootState = "directory",
) {
  const output = {
    stdout: "",
    stderr: "",
    roots: [] as string[],
    fileLoggers: [] as Logger[],
    logPaths: [] as (string | undefined)[],
  };
  const logger = new RecordingLogger();
  const dependencies: CliDependencies = {
    version: "1.2.3",
    cwd: "/work",
    writeStdout: (text) => {
      output.stdout += text;
    },
    writeStderr: (text) => {
      output.stderr += text;
    },
    inspectRoot: () => Promise.resolve(rootState),
    createFiles: (root, filesLogger) => {
      output.roots.push(root);
      output.fileLoggers.push(filesLogger);
      return createFiles(root);
    },
    createLogger: (path) => {
      output.logPaths.push(path);
      return { logger, path: path ?? LOG_PATH };
    },
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
    resolvePath: (cwd, path) => (path === "." ? cwd : `${cwd}/${path}`),
  };
  return { dependencies, output, logger };
}

const project = () => new InMemoryProjectFiles({ "src/a.ts": 'import "openapi-fetch";\n' });

describe("runCli", () => {
  it("runCli prints the help", async () => {
    const { dependencies, output } = setUp(project);

    expect(await runCli(["--help"], dependencies)).toBe(EXIT_CODES.success);
    expect(output.stdout).toBe(HELP_TEXT);
    expect(output.stdout).toContain("Exit codes");
  });

  it("runCli prints the version", async () => {
    const { dependencies, output } = setUp(project);

    expect(await runCli(["-v"], dependencies)).toBe(EXIT_CODES.success);
    expect(output.stdout).toBe("1.2.3\n");
  });

  it("runCli rejects unknown options with the usage exit code", async () => {
    const { dependencies, output } = setUp(project);

    expect(await runCli(["--bogus"], dependencies)).toBe(EXIT_CODES.usage);
    expect(output.stderr).toContain("--bogus");
    expect(output.stderr).toContain("--help");
  });

  it("runCli migrates the current directory on a dry run and names the log", async () => {
    const files = project();
    const { dependencies, output, logger } = setUp(() => files);

    expect(await runCli([], dependencies)).toBe(EXIT_CODES.success);
    expect(output.roots).toEqual(["/work"]);
    expect(output.fileLoggers).toEqual([logger]);
    expect(output.stdout).toContain('"openapi-fetch" → "openapi-typesafe-fetch"');
    expect(output.stdout).toContain("Dry run");
    expect(output.stdout.endsWith(`Log: ${LOG_PATH}\n`)).toBe(true);
    expect(files.written).toEqual([]);
  });

  it("runCli writes with --write in the --root directory and logs to --log", async () => {
    const files = project();
    const { dependencies, output } = setUp(() => files);

    expect(await runCli(["--write", "--root", "app", "--log", "x.jsonl"], dependencies)).toBe(
      EXIT_CODES.success,
    );
    expect(output.roots).toEqual(["/work/app"]);
    expect(output.logPaths).toEqual(["x.jsonl"]);
    expect(files.written).toEqual(["src/a.ts"]);
  });

  it("runCli fails when a write fails and still prints the report", async () => {
    const unwritable = { "src/a.ts": { kind: "io-error", code: "EROFS" } } as const;
    const files = new InMemoryProjectFiles({ "src/a.ts": 'import "openapi-fetch";\n' }, [], {
      unwritable,
    });
    const { dependencies, output } = setUp(() => files);

    expect(await runCli(["--write"], dependencies)).toBe(EXIT_CODES.failure);
    expect(output.stdout).toContain("Writing stopped: src/a.ts could not be written (EROFS).");
  });

  it("runCli reports a failure, logs it and still names the log", async () => {
    const { dependencies, output, logger } = setUp(() => ({
      listFiles: () => Promise.reject(new Error("ENOENT: no such directory")),
      read: () => Promise.reject(new Error("unused")),
      write: () => Promise.reject(new Error("unused")),
    }));

    expect(await runCli([], dependencies)).toBe(EXIT_CODES.failure);
    expect(output.stderr).toBe("ENOENT: no such directory\n");
    expect(output.stdout).toBe(`Log: ${LOG_PATH}\n`);
    expect(logger.events.at(-1)).toEqual({
      level: "warn",
      event: "migration_failed",
      fields: { root: "/work", message: "ENOENT: no such directory" },
    });
  });

  it("runCli with a log that cannot be created fails with a message and touches no file", async () => {
    const files = project();
    const { dependencies, output } = setUp(() => files);
    const failing: CliDependencies = {
      ...dependencies,
      createLogger: () => {
        throw new Error("EEXIST: file already exists, mkdir '/work/file'");
      },
    };

    expect(await runCli(["--write", "--log", "file/x.jsonl"], failing)).toBe(EXIT_CODES.failure);
    expect(output.stderr).toBe(
      "Cannot create the log file/x.jsonl: EEXIST: file already exists, mkdir '/work/file'\n",
    );
    expect(output.stdout).toBe("");
    expect(output.roots).toEqual([]);
    expect(files.written).toEqual([]);
  });

  it("runCli without --log names the temporary directory when its log cannot be created", async () => {
    const { dependencies, output } = setUp(project);
    const failing: CliDependencies = {
      ...dependencies,
      createLogger: () => {
        throw new Error("ENOSPC: no space left on device");
      },
    };

    expect(await runCli([], failing)).toBe(EXIT_CODES.failure);
    expect(output.stderr).toBe(
      "Cannot create the log in the temporary directory: ENOSPC: no space left on device\n",
    );
  });

  it.each([
    ["missing", "The project folder /work/app does not exist\n"],
    [
      "not-a-directory",
      "The project folder /work/app is not a folder; --root takes the project folder\n",
    ],
  ] as const)(
    "runCli with a root that is %s fails before listing files",
    async (state, message) => {
      const { dependencies, output, logger } = setUp(project, state);

      expect(await runCli(["--root", "app"], dependencies)).toBe(EXIT_CODES.failure);
      expect(output.stderr).toBe(message);
      expect(output.stdout).toBe(`Log: ${LOG_PATH}\n`);
      expect(output.roots).toEqual([]);
      expect(logger.events).toEqual([
        { level: "warn", event: "root_unusable", fields: { root: "/work/app", rootState: state } },
      ]);
    },
  );

  it("runCli passes on errors that are not usage errors", async () => {
    const { dependencies } = setUp(project);
    const failing = {
      ...dependencies,
      writeStdout: () => {
        throw new RangeError("closed");
      },
    };

    await expect(runCli(["--help"], failing)).rejects.toThrow(RangeError);
  });
});
