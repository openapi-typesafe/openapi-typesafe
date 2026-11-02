import { describe, expect, it } from "vitest";
import type { ProjectFiles } from "../../src/application/ports.js";
import { HELP_TEXT } from "../../src/cli/cli-text.js";
import { type CliDependencies, EXIT_CODES, runCli } from "../../src/cli/run-cli.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const LOG_PATH = "/tmp/run.jsonl";

function setUp(createFiles: (root: string) => ProjectFiles) {
  const output = {
    stdout: "",
    stderr: "",
    roots: [] as string[],
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
    createFiles: (root) => {
      output.roots.push(root);
      return createFiles(root);
    },
    createLogger: (path) => {
      output.logPaths.push(path);
      return { logger, path: path ?? LOG_PATH };
    },
    rewriter: new StubCallbackRewriter(),
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
    const { dependencies, output } = setUp(() => files);

    expect(await runCli([], dependencies)).toBe(EXIT_CODES.success);
    expect(output.roots).toEqual(["/work"]);
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
