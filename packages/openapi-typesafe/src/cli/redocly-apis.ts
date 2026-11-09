import type { RedoclyConfig } from "../application/ports/redocly-config-source.js";
import type { GeneratorOptions } from "../types.js";
import {
  type ApiSettings,
  apiFixNames,
  apiFlags,
  apiOutputOf,
  apiRefLimitOptions,
  OUTPUT_SETTING,
  unknownSettingWarnings,
} from "./api-settings.js";
import { cliError } from "./cli-errors.js";
import {
  type CliRun,
  emitOutput,
  ensureOutputIsNotSchema,
  ensureOutputIsOwn,
  type NamedFile,
  outputFileOf,
  parseLocationUrl,
  resolveLocationUrl,
} from "./cli-output.js";
import { MULTIPLE_SCHEMAS_DOCS_URL } from "./docs-links.js";
import { fixOption } from "./fix-option.js";
import { refLimitOptions } from "./ref-limits.js";

/** The `apis` of a Redocly config: each API is generated into its `x-openapi-ts.output`. */

/** The key of an API's openapi-typesafe settings in `redocly.yaml`. */
const REDOCLY_CONFIG_KEY = "x-openapi-ts";

/** An API of the config as written: `root` and the settings are not checked yet. */
interface RedoclyApi {
  readonly name: string;
  readonly root: unknown;
  readonly settings: unknown;
}

function redoclyApisOf(redocly: RedoclyConfig): RedoclyApi[] {
  return Object.entries(redocly.apis ?? {}).map(([name, api]) => {
    const fields = api as Readonly<Record<string, unknown>>;
    return { name, root: fields.root, settings: fields[REDOCLY_CONFIG_KEY] };
  });
}

export function hasRedoclyApis(redocly: RedoclyConfig): boolean {
  return Object.keys(redocly.apis ?? {}).length > 0;
}

/** Paths in the config are relative to the config file; without a file, to the working dir. */
function configRootOf(redocly: RedoclyConfig, cwd: URL): URL {
  return redocly.configFile ? resolveLocationUrl(redocly.configFile, cwd) : cwd;
}

/** An API whose root and settings are usable, and the directory its paths are relative to. */
interface ApiTarget {
  readonly name: string;
  readonly root: string;
  readonly settings: ApiSettings;
  readonly configRoot: URL;
}

function isSettingsMap(value: unknown): value is ApiSettings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The API with its settings. Fails with `CLI_CONFIG_OUTPUT_MISSING` when they name no output, and
 * with `CLI_CONFIG_INVALID` when they are no map or `root` is no path or URL; only this API then
 * fails, the others are still generated.
 */
function apiTarget(api: RedoclyApi, configRoot: URL): ApiTarget {
  const { name, root, settings } = api;
  if (settings !== undefined && !isSettingsMap(settings)) {
    throw cliError("CLI_CONFIG_INVALID", `API ${name}: \`${REDOCLY_CONFIG_KEY}\` must be a map`);
  }
  if (!settings?.[OUTPUT_SETTING]) {
    throw cliError(
      "CLI_CONFIG_OUTPUT_MISSING",
      `API ${name} is missing an \`${REDOCLY_CONFIG_KEY}.output\` key. ` +
        `See ${MULTIPLE_SCHEMAS_DOCS_URL}`,
    );
  }
  if (typeof root !== "string" || root === "") {
    throw cliError(
      "CLI_CONFIG_INVALID",
      `API ${name}: \`root\` in redocly.yaml must be the path or URL of its schema`,
    );
  }
  return { name, root, settings, configRoot };
}

/** The generator options of one API: its own settings win over the CLI's flags. */
function apiOptions(run: CliRun, redocly: RedoclyConfig, target: ApiTarget): GeneratorOptions {
  const { name, settings, configRoot } = target;
  return {
    ...run.args.generatorFlags,
    ...apiFlags(name, settings),
    ...refLimitOptions(run.args, run.deps.cwd),
    ...apiRefLimitOptions(name, settings, configRoot),
    ...fixOption(apiFixNames(name, settings) ?? run.args.fix),
    redocly,
  };
}

/** The schemas and outputs of every API of the config, keyed by API name for the outputs. */
interface ConfigFiles {
  readonly schemas: readonly NamedFile[];
  readonly outputs: ReadonlyMap<string, URL>;
}

/** The outputs of the other APIs, as `ensureOutputIsOwn` names them. */
function otherOutputs(files: ConfigFiles, apiName: string): NamedFile[] {
  return [...files.outputs]
    .filter(([name]) => name !== apiName)
    .map(([name, location]) => ({ name: `API ${name}`, location }));
}

/**
 * Generate one API into its output. The output must not be the schema of any API of the config
 * (its own, or one that another API reads while this one is written) nor another API's output.
 */
async function generateApi(
  run: CliRun,
  redocly: RedoclyConfig,
  target: ApiTarget,
  files: ConfigFiles,
): Promise<void> {
  for (const warning of unknownSettingWarnings(target.name, target.settings)) {
    run.deps.logger.warn(warning);
  }
  const output = apiOutputOf(target.name, target.settings);
  const outputFile = outputFileOf(run, { source: target.name, output }, target.configRoot);
  ensureOutputIsNotSchema(run, outputFile, files.schemas);
  ensureOutputIsOwn(run, outputFile, otherOutputs(files, target.name));
  const source = resolveLocationUrl(target.root, target.configRoot);
  const contents = await run.deps.generate(source, apiOptions(run, redocly, target));
  emitOutput(run, outputFile, contents);
}

/**
 * The schema and the output of every API. A location that is no text or no valid URL is left
 * out: it is no file that an output could be, and its own API fails on it, not every API.
 */
function configFilesOf(apis: readonly RedoclyApi[], configRoot: URL): ConfigFiles {
  const schemas = apis.flatMap(({ name, root }) => {
    const location = typeof root === "string" ? parseLocationUrl(root, configRoot) : undefined;
    return location ? [{ name: `schema ${root} of API ${name}`, location }] : [];
  });
  const outputs = new Map<string, URL>();
  for (const api of apis) {
    const output = isSettingsMap(api.settings) ? api.settings[OUTPUT_SETTING] : undefined;
    const location = typeof output === "string" ? parseLocationUrl(output, configRoot) : undefined;
    if (location) {
      outputs.set(api.name, location);
    }
  }
  return { schemas, outputs };
}

/**
 * Generate every API of the config, concurrently. Every API is generated or checked even when
 * another fails, so `--check` reports a stale output wherever it is; the failures are returned
 * in the order of the config.
 */
export async function generateRedoclyApis(run: CliRun, redocly: RedoclyConfig): Promise<unknown[]> {
  const apis = redoclyApisOf(redocly);
  const configRoot = configRootOf(redocly, run.deps.cwd);
  const files = configFilesOf(apis, configRoot);
  const results = await Promise.allSettled(
    apis.map(async (api) => generateApi(run, redocly, apiTarget(api, configRoot), files)),
  );
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}
