import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  DirectoryCheck,
  FileIdentity,
  FileReader,
  FileWriter,
} from "../../src/application/ports/file-system.js";
import type { DebugGroup, Logger } from "../../src/application/ports/logger.js";
import type {
  RedoclyConfig,
  RedoclyConfigSource,
} from "../../src/application/ports/redocly-config-source.js";
import type { CliConsole, CliDependencies } from "../../src/cli/cli-dependencies.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../../src/domain/errors.js";
import type { GeneratorOptions, SchemaSource } from "../../src/types.js";

/** In-memory fakes of the CLI's dependencies (CODING_PRINCIPLES 6.1, rule 7). */

/**
 * A fake absolute path in the form of the platform, written POSIX style: `/work/a.yaml` is
 * `D:\work\a.yaml` on Windows, as the CLI resolves it there, so these tests run on every OS.
 */
export function fakePath(posixPath: string): string {
  return path.resolve(posixPath);
}

/** The `file:` URL of fakePath(posixPath). */
export function fakeUrl(posixPath: string): string {
  return pathToFileURL(fakePath(posixPath)).href;
}

export const FAKE_CWD = pathToFileURL(`${fakePath("/work")}${path.sep}`);

export class RecordingLogger implements Logger {
  readonly lines: { level: "debug" | "warn" | "error"; message: string }[] = [];

  debug(message: string, _group?: DebugGroup): void {
    this.lines.push({ level: "debug", message });
  }

  warn(message: string): void {
    this.lines.push({ level: "warn", message });
  }

  error(message: string): void {
    this.lines.push({ level: "error", message });
  }

  messages(level: "debug" | "warn" | "error"): string[] {
    return this.lines.filter((line) => line.level === level).map((line) => line.message);
  }
}

export class RecordingConsole implements CliConsole {
  readonly infoLines: string[] = [];
  readonly noticeLines: string[] = [];

  info(text: string): void {
    this.infoLines.push(text);
  }

  notice(text: string): void {
    this.noticeLines.push(text);
  }
}

/**
 * Files by absolute path; a missing file fails to read as the Node adapter does. `links` maps a
 * path to the path it names, as a symbolic link or another letter case does on disk. A directory
 * is one in `directories` or one that holds a file.
 */
export class InMemoryFiles implements FileReader, FileWriter, FileIdentity, DirectoryCheck {
  readonly files = new Map<string, string>();
  readonly links = new Map<string, string>();
  readonly directories = new Set<string>();

  isDirectory(file: URL): boolean {
    const directory = fileURLToPath(file);
    const inside = `${directory}${path.sep}`;
    return (
      this.directories.has(directory) ||
      [...this.files.keys()].some((name) => name.startsWith(inside))
    );
  }

  isSameFile(left: URL, right: URL): boolean {
    return this.targetOf(left) === this.targetOf(right);
  }

  private targetOf(file: URL): string {
    const filePath = fileURLToPath(file);
    return this.links.get(filePath) ?? filePath;
  }

  readText(file: URL): string {
    const contents = this.files.get(fileURLToPath(file));
    if (contents === undefined) {
      throw new OpenAPITypesafeError({
        code: ERROR_CODES.OUTPUT_READ_FAILED,
        message: `Cannot read ${fileURLToPath(file)}: no such file`,
      });
    }
    return contents;
  }

  writeText(file: URL, contents: string): void {
    this.files.set(fileURLToPath(file), contents);
  }
}

/** Config files by path; `found` is what a search without an explicit path finds. */
export class InMemoryRedoclyConfigs implements RedoclyConfigSource {
  readonly configs = new Map<string, RedoclyConfig>();
  found: string | undefined;
  readonly defaultConfig = fakeRedoclyConfig({});

  find(explicitPath: string | undefined): string | undefined {
    if (explicitPath === undefined) {
      return this.found;
    }
    return this.configs.has(explicitPath) ? explicitPath : undefined;
  }

  async load(configPath: string): Promise<RedoclyConfig> {
    const config = this.configs.get(configPath);
    if (!config) {
      throw new Error(`no fake config at ${configPath}`);
    }
    return config;
  }

  async createDefault(): Promise<RedoclyConfig> {
    return this.defaultConfig;
  }
}

/** A Redocly config with only what the CLI reads: the APIs and the config file. */
export function fakeRedoclyConfig(
  apis: Record<string, Record<string, unknown>>,
  configFile?: string,
): RedoclyConfig {
  return { apis, configFile } as unknown as RedoclyConfig;
}

export interface GenerateCall {
  readonly source: SchemaSource;
  readonly options: GeneratorOptions;
}

/** Generates `types of <source>`, or throws the error registered for that source. */
export class FakeGenerator {
  readonly calls: GenerateCall[] = [];
  readonly failures = new Map<string, unknown>();

  readonly generate = async (source: SchemaSource, options: GeneratorOptions): Promise<string> => {
    this.calls.push({ source, options });
    const name = source instanceof URL ? source.href : "stdin";
    if (this.failures.has(name)) {
      throw this.failures.get(name);
    }
    return `types of ${name}`;
  };
}

/** A clock that moves 5 ms on every reading. */
export function steppingClock(): () => number {
  let now = 0;
  return () => {
    now += 5;
    return now;
  };
}

export interface FakeCli {
  readonly deps: CliDependencies;
  readonly logger: RecordingLogger;
  readonly console: RecordingConsole;
  readonly files: InMemoryFiles;
  readonly redoclyConfigs: InMemoryRedoclyConfigs;
  readonly generator: FakeGenerator;
  readonly stdout: string[];
  readonly stdin: Readable;
}

/** `isStdinTerminal`: stdin is a terminal, as when the CLI runs with nothing piped into it. */
export function createFakeCli({ isStdinTerminal = false } = {}): FakeCli {
  const parts = {
    logger: new RecordingLogger(),
    console: new RecordingConsole(),
    files: new InMemoryFiles(),
    redoclyConfigs: new InMemoryRedoclyConfigs(),
    generator: new FakeGenerator(),
    stdout: [] as string[],
    stdin: Readable.from(["openapi: 3.1.0"]),
  };
  const deps: CliDependencies = {
    ...parts,
    cwd: FAKE_CWD,
    version: "1.2.3",
    writeStdout: (text) => parts.stdout.push(text),
    stdin: () => parts.stdin,
    isStdinTerminal: () => isStdinTerminal,
    generate: parts.generator.generate,
    now: steppingClock(),
    style: { bold: (text) => `*${text}*`, green: (text) => text, dim: (text) => text },
  };
  return { ...parts, deps };
}
