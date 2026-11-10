/**
 * The keys whose values YAML files run as shell commands. A file kind that runs other keys
 * (Taskfile `cmds`, pre-commit `entry`) adds its own to the common ones.
 */

/**
 * Keys whose value is a shell command or a list of them: GitHub Actions and lefthook `run`,
 * GitLab, Travis and Bitbucket `script` and its hooks, Azure Pipelines `script` / `bash` /
 * `pwsh`, CircleCI `command`, Drone `commands`, Docker Compose `command` and `entrypoint`.
 */
export const YAML_COMMAND_KEYS: ReadonlySet<string> = new Set([
  "run",
  "script",
  "before_script",
  "after_script",
  "before_install",
  "install",
  "bash",
  "pwsh",
  "powershell",
  "command",
  "commands",
  "entrypoint",
]);

/**
 * Task (Taskfile.yml): `cmds` and `cmd` run commands, `sh` computes a variable or checks a
 * precondition with one, and `status` lists commands that tell whether a task is up to date.
 */
export const TASKFILE_COMMAND_KEYS: ReadonlySet<string> = new Set([
  ...YAML_COMMAND_KEYS,
  "cmds",
  "cmd",
  "sh",
  "status",
]);
