/** The command's own text: help, usage errors and the closing notes. */

export const HELP_TEXT = `Usage
  openapi-typesafe-migrate [options]

Move a project from openapi-typescript, openapi-fetch, openapi-react-query and
openapi-typescript-helpers to the openapi-typesafe packages. Without --write it only reports.

Options
  --write        Write the changes (default: dry run)
  --root <dir>   The project directory (default: the current directory)
  --log <file>   The JSON Lines log file (default: a new file in the temporary directory)
  --help, -h     Show this help
  --version, -v  Show the version

Exit codes
  0  Done
  1  The migration failed (the message and the log say why), or the log could not be created
  2  Unknown option or argument
`;

export const usageError = (message: string): string =>
  `${message}\nRun openapi-typesafe-migrate --help for the options.\n`;

export const logNote = (path: string): string => `Log: ${path}\n`;

/** `path` is the `--log` value as given; without one the log goes to the temporary directory. */
export const logError = (path: string | undefined, message: string): string =>
  `Cannot create the log ${path ?? "in the temporary directory"}: ${message}\n`;
