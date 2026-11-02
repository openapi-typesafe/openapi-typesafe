import { parseArgs } from "node:util";

export interface MatrixSettings {
  /** Version ids to run; empty means all. */
  readonly typescriptIds: readonly string[];
  readonly logDir: string;
}

/** One check of a large generated example takes about 10 s; 5 minutes leaves room for slow CI. */
export const COMPILER_TIMEOUT_MS = 300_000;

/** Logs go to the repository's `.logs/`, like every other tool (relative to the package). */
const DEFAULT_LOG_DIR = "../../.logs/type-matrix";

/** `--typescript <id>` (repeatable) and `--log-dir <path>`. Throws on unknown options. */
export function parseSettings(argv: readonly string[]): MatrixSettings {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      typescript: { type: "string", multiple: true },
      "log-dir": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  return { typescriptIds: values.typescript ?? [], logDir: values["log-dir"] ?? DEFAULT_LOG_DIR };
}
