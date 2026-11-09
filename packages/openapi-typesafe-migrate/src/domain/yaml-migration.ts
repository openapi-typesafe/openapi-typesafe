import { type CommandMigration, shellTextFindings } from "./command-migration.js";
import { type Change, lineAt, type ManualStep } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";
import { type YamlValue, yamlMappingEntries, yamlValues } from "./yaml-values.js";

/**
 * YAML files are migrated only where they hold commands or package names, so the text of other
 * values (an OpenAPI `description`, a label) stays as written even when it names a package.
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

/** Keys of a Dependabot config whose values are package names (`ignore`, `allow`, `groups`). */
export const DEPENDABOT_NAME_KEYS: ReadonlySet<string> = new Set([
  "dependency-name",
  "patterns",
  "exclude-patterns",
]);

const LINE_BREAK_RE = /\n/g;

/** The shell text of a value: a folded scalar (`>`) joins its lines with spaces. */
function shellText(text: string, value: YamlValue): string {
  const slice = text.slice(value.start, value.end);
  return value.isFolded ? slice.replace(LINE_BREAK_RE, " ") : slice;
}

/**
 * Migrate the commands of a YAML file (CI workflows, Compose files, hook configs). Edits replace
 * words only, never the blanks between them, so they apply to the value as written even where a
 * folded scalar was read with spaces for its line breaks.
 */
export function migrateYamlCommands(text: string, file: string): CommandMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  const edits: TextEdit[] = [];
  for (const value of yamlValues(text, YAML_COMMAND_KEYS)) {
    const locate = (offset: number): string => `${file}:${lineAt(text, value.start + offset)}`;
    const found = shellTextFindings(shellText(text, value), locate);
    changes.push(...found.changes);
    manualSteps.push(...found.manualSteps);
    edits.push(...shiftedEdits(found.edits, value.start));
  }
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}

/** The edits of shell findings in a value, as offsets into the whole text. */
const shiftedEdits = (edits: readonly TextEdit[], offset: number): TextEdit[] =>
  edits.map((edit) => ({ ...edit, start: edit.start + offset, end: edit.end + offset }));

/** The top-level key of a pnpm `package.yaml` whose values are scripts. */
const SCRIPTS_KEY = "scripts";

/** Migrate the scripts of a pnpm `package.yaml` manifest; each finding names its script. */
export function migrateYamlScripts(text: string): CommandMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  const edits: TextEdit[] = [];
  for (const { key, value } of yamlMappingEntries(text, SCRIPTS_KEY)) {
    const found = shellTextFindings(shellText(text, value), () => `${SCRIPTS_KEY}.${key}`);
    changes.push(...found.changes);
    manualSteps.push(...found.manualSteps);
    edits.push(...shiftedEdits(found.edits, value.start));
  }
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}

/** Rename the original packages that a Dependabot config ignores, allows or groups. */
export function migrateDependabotConfig(text: string, file: string): CommandMigration {
  const changes: Change[] = [];
  const edits: TextEdit[] = [];
  for (const value of yamlValues(text, DEPENDABOT_NAME_KEYS)) {
    const from = text.slice(value.start, value.end);
    const to = PACKAGE_RENAMES.get(from);
    if (to !== undefined) {
      const location = `${file}:${lineAt(text, value.start)}`;
      changes.push({ kind: "package-name-renamed", location, from, to });
      edits.push({ start: value.start, end: value.end, text: to });
    }
  }
  return { text: applyTextEdits(text, edits), changes, manualSteps: [] };
}
