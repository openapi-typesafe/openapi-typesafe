/**
 * The programs that run another program or install packages, so the migration can tell the
 * generator command and package names from the words of other commands. `docker run -it` keeps
 * its flag, `npm run openapi-typescript` names a script, and `npm i openapi-fetch` a package.
 */

/** A program that runs the program named by its first argument that is not an option. */
export interface Launcher {
  /** The words that start it: `npx`, or `pnpm dlx`. */
  readonly words: readonly string[];
  /** Options whose value is the next word, so that word is not the program. */
  readonly valueOptions: ReadonlySet<string>;
  /** Options whose value is a package to install first (`npx -p <package>`). */
  readonly packageOptions: ReadonlySet<string>;
  /** Arguments before the program that are not options: the image of `docker run <image>`. */
  readonly operands: number;
}

const NONE: ReadonlySet<string> = new Set();
/** `npx -p`, `pnpm dlx --package`, `yarn dlx -p`, `bunx -p`. */
const PACKAGE_OPTIONS: ReadonlySet<string> = new Set(["-p", "--package"]);
/** Options of npm, pnpm and yarn that take a value and may come before the subcommand. */
const PACKAGE_MANAGER_OPTIONS: ReadonlySet<string> = new Set([
  "--filter",
  "-F",
  "--dir",
  "-C",
  "--prefix",
  "--cwd",
  "--workspace",
]);

const launcher = (
  words: readonly string[],
  packageOptions: ReadonlySet<string> = NONE,
  valueOptions: ReadonlySet<string> = NONE,
): Launcher => {
  const allValueOptions = new Set([...valueOptions, ...packageOptions]);
  return { words, packageOptions, valueOptions: allValueOptions, operands: 0 };
};

/** Options of `docker run` and `docker exec` that take a value. */
const CONTAINER_OPTIONS: ReadonlySet<string> = new Set([
  "-e",
  "--env",
  "--env-file",
  "-v",
  "--volume",
  "--mount",
  "-p",
  "--publish",
  "-w",
  "--workdir",
  "-u",
  "--user",
  "--name",
  "--network",
  "--entrypoint",
  "--platform",
  "-l",
  "--label",
  "-h",
  "--hostname",
  "--add-host",
]);

/** `docker run <image> <command>`: the image comes first, then the command run in it. */
const container = (words: readonly string[]): Launcher => ({
  ...launcher(words, NONE, CONTAINER_OPTIONS),
  operands: 1,
});

/** A launcher with arguments before the program: the duration of `timeout 60 <command>`. */
const withOperands = (
  words: readonly string[],
  operands: number,
  valueOptions: ReadonlySet<string> = NONE,
): Launcher => ({ ...launcher(words, NONE, valueOptions), operands });

/** Options of `xargs` that take a value (GNU and BSD). */
const XARGS_OPTIONS: ReadonlySet<string> = new Set([
  "-I",
  "-J",
  "-L",
  "-n",
  "-P",
  "-R",
  "-S",
  "-s",
  "-d",
  "-E",
  "-a",
  "--max-args",
  "--max-procs",
  "--max-lines",
  "--delimiter",
  "--arg-file",
]);

/** Options of `node`, which `tsx` and `ts-node` take too, that are followed by a value. */
const NODE_OPTIONS: ReadonlySet<string> = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--env-file",
]);

/**
 * The launchers, longest first, so `pnpm dlx` wins over `pnpm`. A bare `pnpm <name>`, `yarn
 * <name>` or `bun <name>` runs the binary `<name>` when no script has that name; `run` names a
 * script first, so `npm run`, `yarn run` and `bun run` are no launchers: a word after them that
 * names an old package is reported (command-migration.ts).
 */
export const LAUNCHERS: readonly Launcher[] = [
  launcher(["npm", "exec"], PACKAGE_OPTIONS),
  launcher(["npm", "x"], PACKAGE_OPTIONS),
  launcher(["pnpm", "exec"], NONE, PACKAGE_MANAGER_OPTIONS),
  launcher(["pnpm", "dlx"], new Set(["--package"])),
  launcher(["yarn", "dlx"], PACKAGE_OPTIONS),
  launcher(["yarn", "exec"]),
  launcher(["bun", "x"], PACKAGE_OPTIONS),
  withOperands(["yarn", "workspace"], 1),
  launcher(["dotenvx", "run"], NONE, new Set(["-f", "--env-file", "-e", "--env", "--convention"])),
  launcher(
    ["doppler", "run"],
    NONE,
    new Set(["-p", "--project", "-c", "--config", "--token", "--mount", "--scope"]),
  ),
  launcher(["nx", "exec"], NONE, new Set(["--projects", "-p", "--exclude"])),
  launcher(["deno", "run"], NONE, new Set(["--config", "-c", "--import-map", "--location"])),
  launcher(["deno", "x"]),
  launcher(["npx"], PACKAGE_OPTIONS, new Set(["-c", "--call"])),
  launcher(["pnpx"], PACKAGE_OPTIONS),
  launcher(["bunx"], PACKAGE_OPTIONS),
  // Like a bare `pnpm <name>`, a bare `bun <name>` runs the binary when no script has the name.
  launcher(["bun"], NONE, new Set(["--cwd", "--filter", "-F"])),
  launcher(["corepack"]),
  launcher(["pnpm"], NONE, PACKAGE_MANAGER_OPTIONS),
  launcher(["yarn"], NONE, PACKAGE_MANAGER_OPTIONS),
  launcher(["node"], NONE, NODE_OPTIONS),
  launcher(["tsx"], NONE, NODE_OPTIONS),
  launcher(["ts-node"], NONE, new Set([...NODE_OPTIONS, "-P", "--project", "-O", "--compiler"])),
  launcher(["cross-env"]),
  launcher(["dotenv"], NONE, new Set(["-e", "-c", "-v"])),
  launcher(["env"], NONE, new Set(["-u", "--unset", "-C", "--chdir"])),
  launcher(["exec"], NONE, new Set(["-a"])),
  launcher(["command"]),
  launcher(["time"]),
  launcher(["nice"], NONE, new Set(["-n", "--adjustment"])),
  withOperands(["timeout"], 1, new Set(["-s", "--signal", "-k", "--kill-after"])),
  launcher(["xargs"], NONE, XARGS_OPTIONS),
  launcher(["nohup"]),
  launcher(["sudo"], NONE, new Set(["-u", "-g"])),
  // The shell form of Dockerfile instructions runs the rest of the line in a shell.
  launcher(["RUN"], NONE, new Set(["--mount", "--network", "--security"])),
  launcher(["CMD"]),
  launcher(["ENTRYPOINT"]),
  container(["docker", "run"]),
  container(["docker", "exec"]),
  container(["docker", "compose", "run"]),
  container(["docker", "compose", "exec"]),
  container(["podman", "run"]),
  container(["podman", "exec"]),
];

/** A subcommand that installs, updates or removes the packages named by its other arguments. */
export interface Installer {
  readonly words: readonly string[];
}

const installers = (manager: string, subcommands: readonly string[]): Installer[] =>
  subcommands.map((subcommand) => ({ words: [manager, subcommand] }));

const NPM_INSTALL = ["install", "i", "add", "update", "up", "uninstall", "remove", "rm", "un"];

export const INSTALLERS: readonly Installer[] = [
  ...installers("npm", NPM_INSTALL),
  ...installers("pnpm", ["add", "update", "up", "remove", "rm", "uninstall", "un"]),
  ...installers("yarn", ["add", "upgrade", "up", "remove"]),
  // Yarn 1 installs global packages with `yarn global add`.
  { words: ["yarn", "global", "add"] },
  { words: ["yarn", "global", "remove"] },
  ...installers("bun", ["add", "a", "update", "remove", "rm", "install", "i"]),
  ...installers("deno", ["add", "install", "i", "remove", "uninstall"]),
];

/** `npm:` names a package in Deno commands (`deno run npm:openapi-typescript`). */
export const NPM_SPECIFIER_PREFIX = "npm:";
