import {
  type CommandPathPattern,
  LINT_STAGED_COMMAND_PATHS,
  NX_PROJECT_COMMAND_PATHS,
  NX_WORKSPACE_COMMAND_PATHS,
  SIMPLE_GIT_HOOKS_COMMAND_PATHS,
} from "../domain/command-paths.js";
import { migrateJsonCommands } from "../domain/json-command-migration.js";
import { migratePreCommitHooks } from "../domain/pre-commit-migration.js";
import { TASKFILE } from "../domain/yaml-environments.js";
import { migrateYamlCommands, migrateYamlPathCommands } from "../domain/yaml-migration.js";
import {
  type ConfigStep,
  type FileKind,
  jsonConfig,
  stringsStep,
  usedValuesStep,
  whenNamed,
  yamlConfig,
} from "./config-steps.js";
import {
  baseName,
  LINT_STAGED_JSON_FILE,
  LINT_STAGED_YAML_FILES,
  NX_PROJECT_FILE,
  NX_WORKSPACE_FILE,
  PRE_COMMIT_FILES,
  SIMPLE_GIT_HOOKS_FILES,
  TASKFILE_NAMES,
} from "./project-file-names.js";
import { outsideVariablesOf } from "./yaml-file-reach.js";

/** The commands of a JSON config at the paths of `patterns`. */
export const jsonCommandsStep = (patterns: readonly CommandPathPattern[]): ConfigStep =>
  stringsStep((text, strings) => migrateJsonCommands(text, strings, patterns));

/** A YAML config whose commands are at the paths of `patterns`. */
export const yamlPathCommands = (patterns: readonly CommandPathPattern[]): ConfigStep =>
  stringsStep((text, strings) => migrateYamlPathCommands(text, strings, patterns));

/**
 * Configs that only hold commands, by file name: they come before the generic YAML kind, which
 * would read them by the common command keys only.
 */
export const COMMAND_CONFIG_KINDS: readonly FileKind[] = [
  {
    matches: (path) => baseName(path) === NX_PROJECT_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(NX_PROJECT_COMMAND_PATHS)]),
  },
  {
    matches: (path) => baseName(path) === NX_WORKSPACE_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(NX_WORKSPACE_COMMAND_PATHS)]),
  },
  {
    matches: (path) => baseName(path) === LINT_STAGED_JSON_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(LINT_STAGED_COMMAND_PATHS)]),
  },
  {
    matches: (path) => LINT_STAGED_YAML_FILES.has(baseName(path)),
    migrate: whenNamed(yamlConfig(() => [yamlPathCommands(LINT_STAGED_COMMAND_PATHS)])),
  },
  {
    matches: (path) => SIMPLE_GIT_HOOKS_FILES.has(baseName(path)),
    migrate: jsonConfig(() => [jsonCommandsStep(SIMPLE_GIT_HOOKS_COMMAND_PATHS)]),
  },
  {
    matches: (path) => TASKFILE_NAMES.has(baseName(path)),
    migrate: whenNamed(
      yamlConfig((context, path) => [
        usedValuesStep((text, values) =>
          migrateYamlCommands(text, path, values, {
            ...TASKFILE,
            outsideVariables: outsideVariablesOf(context.yamlReach, path),
          }),
        ),
      ]),
    ),
  },
  {
    matches: (path) => PRE_COMMIT_FILES.has(baseName(path)),
    migrate: whenNamed(
      yamlConfig((_context, path) => [
        stringsStep((text, strings) => migratePreCommitHooks(text, path, strings)),
      ]),
    ),
  },
];
