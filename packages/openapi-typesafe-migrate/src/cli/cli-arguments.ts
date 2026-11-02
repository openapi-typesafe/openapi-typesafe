import { parseArgs } from "node:util";

/** What the command was asked to do. */
export type CliRequest =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | {
      readonly kind: "migrate";
      readonly isWrite: boolean;
      readonly root: string | undefined;
      readonly logPath: string | undefined;
    };

const OPTIONS = {
  write: { type: "boolean" },
  root: { type: "string" },
  log: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

/** Parse the arguments; unknown options and positionals throw a TypeError with Node's message. */
export function parseCliArguments(argv: readonly string[]): CliRequest {
  const { values } = parseArgs({ args: [...argv], options: OPTIONS, strict: true });
  if (values.help === true) {
    return { kind: "help" };
  }
  if (values.version === true) {
    return { kind: "version" };
  }
  return {
    kind: "migrate",
    isWrite: values.write === true,
    root: values.root,
    logPath: values.log,
  };
}
