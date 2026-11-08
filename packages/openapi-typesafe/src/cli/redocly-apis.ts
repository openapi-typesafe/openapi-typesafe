import { kebabCase } from "scule";
import type { RedoclyConfig } from "../application/ports/redocly-config-source.js";
import type { OutputFixName } from "../domain/output-fixes.js";
import type { GeneratorOptions } from "../types.js";
import {
  type ApiSettings,
  apiRefLimitOptions,
  FIX_SETTING,
  OUTPUT_SETTING,
  unknownSettingWarnings,
} from "./api-settings.js";
import { GENERATOR_FLAGS, type GeneratorFlags } from "./cli-arguments.js";
import { cliError } from "./cli-errors.js";
import {
  type CliRun,
  emitOutput,
  ensureOutputIsNotSchema,
  parseLocationUrl,
  resolveLocationUrl,
  type SchemaFile,
} from "./cli-output.js";
import { MULTIPLE_SCHEMAS_DOCS_URL } from "./docs-links.js";
import { fixNamesOf, fixOption } from "./fix-option.js";
import { refLimitOptions } from "./ref-limits.js";

/** The `apis` of a Redocly config: each API is generated into its `x-openapi-ts.output`. */

/** The key of an API's openapi-typesafe settings in `redocly.yaml`. */
const REDOCLY_CONFIG_KEY = "x-openapi-ts";

interface RedoclyApi {
  readonly name: string;
  readonly root: string;
  readonly settings: ApiSettings | undefined;
}

function redoclyApisOf(redocly: RedoclyConfig): RedoclyApi[] {
  return Object.entries(redocly.apis ?? {}).map(([name, api]) => {
    const settings = (api as Record<string, unknown>)[REDOCLY_CONFIG_KEY];
    return { name, root: api.root, settings: settings as ApiSettings | undefined };
  });
}

export function hasRedoclyApis(redocly: RedoclyConfig): boolean {
  return Object.keys(redocly.apis ?? {}).length > 0;
}

/** The boolean flags an API sets, in camelCase or kebab-case; they win over the CLI's flags. */
function apiFlags(settings: ApiSettings): GeneratorFlags {
  const flags: Partial<Record<(typeof GENERATOR_FLAGS)[number], boolean>> = {};
  for (const name of GENERATOR_FLAGS) {
    const value = typeof settings[name] === "boolean" ? settings[name] : settings[kebabCase(name)];
    if (typeof value === "boolean") {
      flags[name] = value;
    }
  }
  return flags;
}

/** The API's `fix` names; they replace the CLI's `--fix`, as its boolean settings win (ADR-021). */
function apiFixNames(settings: ApiSettings): readonly OutputFixName[] | undefined {
  return fixNamesOf(settings[FIX_SETTING]);
}

/** Paths in the config are relative to the config file; without a file, to the working dir. */
function configRootOf(redocly: RedoclyConfig, cwd: URL): URL {
  return redocly.configFile ? resolveLocationUrl(redocly.configFile, cwd) : cwd;
}

/** An API that names its output, and the directory its paths are relative to. */
interface ApiTarget {
  readonly name: string;
  readonly root: string;
  readonly settings: ApiSettings;
  readonly configRoot: URL;
}

/** The API with its settings, or `CLI_CONFIG_OUTPUT_MISSING` when they name no output. */
function apiTarget(api: RedoclyApi, configRoot: URL): ApiTarget {
  const { settings } = api;
  if (!settings?.[OUTPUT_SETTING]) {
    throw cliError(
      "CLI_CONFIG_OUTPUT_MISSING",
      `API ${api.name} is missing an \`${REDOCLY_CONFIG_KEY}.output\` key. ` +
        `See ${MULTIPLE_SCHEMAS_DOCS_URL}`,
    );
  }
  return { name: api.name, root: api.root, settings, configRoot };
}

/** The generator options of one API: its own settings win over the CLI's flags. */
function apiOptions(run: CliRun, redocly: RedoclyConfig, target: ApiTarget): GeneratorOptions {
  const { name, settings, configRoot } = target;
  return {
    ...run.args.generatorFlags,
    ...apiFlags(settings),
    ...refLimitOptions(run.args, run.deps.cwd),
    ...apiRefLimitOptions(name, settings, configRoot),
    ...fixOption(apiFixNames(settings) ?? run.args.fix),
    redocly,
  };
}

/**
 * Generate one API into its output. The output must not be the schema of any API of the config:
 * its own, or one that another API reads while this one is written.
 */
async function generateApi(
  run: CliRun,
  redocly: RedoclyConfig,
  target: ApiTarget,
  schemas: readonly SchemaFile[],
): Promise<void> {
  for (const warning of unknownSettingWarnings(target.name, target.settings)) {
    run.deps.logger.warn(warning);
  }
  const output = String(target.settings[OUTPUT_SETTING]);
  const file = resolveLocationUrl(output, target.configRoot);
  const outputFile = { source: target.name, output, file };
  ensureOutputIsNotSchema(run, outputFile, schemas);
  const source = resolveLocationUrl(target.root, target.configRoot);
  const contents = await run.deps.generate(source, apiOptions(run, redocly, target));
  emitOutput(run, outputFile, contents);
}

/**
 * The schema of every API, as `ensureOutputIsNotSchema` names it. A root that is not a valid URL
 * is left out: it is no file an output could be, and its own API fails on it, not every API.
 */
function apiSchemaFiles(apis: readonly RedoclyApi[], configRoot: URL): SchemaFile[] {
  return apis.flatMap((api) => {
    const location = parseLocationUrl(api.root, configRoot);
    return location ? [{ name: `${api.root} of API ${api.name}`, location }] : [];
  });
}

/**
 * Generate every API of the config, concurrently. Every API is generated or checked even when
 * another fails, so `--check` reports a stale output wherever it is; the failures are returned
 * in the order of the config.
 */
export async function generateRedoclyApis(run: CliRun, redocly: RedoclyConfig): Promise<unknown[]> {
  const apis = redoclyApisOf(redocly);
  const configRoot = configRootOf(redocly, run.deps.cwd);
  const schemas = apiSchemaFiles(apis, configRoot);
  const results = await Promise.allSettled(
    apis.map(async (api) => generateApi(run, redocly, apiTarget(api, configRoot), schemas)),
  );
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}
