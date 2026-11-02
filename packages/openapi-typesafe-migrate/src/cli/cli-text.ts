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
`;

export const usageError = (message: string): string =>
  `${message}\nRun openapi-typesafe-migrate --help for the options.\n`;

export const logNote = (path: string): string => `Log: ${path}\n`;
